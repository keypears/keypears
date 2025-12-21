import { useState } from "react";
import { Send, Loader2, Zap, Cpu } from "lucide-react";
import { Button } from "~app/components/ui/button";
import { createClientFromDomain } from "@keypears/api-server/client";
import { getSessionToken, getVaultKey } from "~app/lib/vault-store";
import { usePowMiner } from "~app/lib/use-pow-miner";
import { deriveEngagementPrivKey } from "~app/lib/engagement-key-utils";
import { encryptMessage, createTextMessage } from "~app/lib/message-encryption";
import { pushSecretUpdate } from "~app/lib/sync";
import type { SecretBlobData } from "~app/lib/secret-encryption";
import { FixedBuf, sign } from "@keypears/lib";

// Fallback difficulty (used only if API doesn't provide one, which shouldn't happen)
const FALLBACK_MESSAGING_DIFFICULTY = 4_000_000;

type SendPhase =
  | "idle"
  | "preparing"
  | "mining"
  | "sending"
  | "saving"
  | "error";

interface ComposeBoxProps {
  vaultId: string;
  vaultDomain: string;
  ownerAddress: string;
  counterpartyAddress: string;
  onMessageSent?: () => void;
}

function parseAddress(
  address: string,
): { name: string; domain: string } | null {
  const parts = address.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { name: parts[0], domain: parts[1] };
}

export function ComposeBox({
  vaultId,
  vaultDomain,
  ownerAddress,
  counterpartyAddress,
  onMessageSent,
}: ComposeBoxProps): React.ReactElement {
  const [messageText, setMessageText] = useState("");
  const [phase, setPhase] = useState<SendPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  // PoW miner (for UI state only - we call start() with overrides)
  const miner = usePowMiner({
    domain: "", // Will be overridden in start()
    difficulty: FALLBACK_MESSAGING_DIFFICULTY,
    preferWgsl: true,
    verifyWithServer: false,
  });

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!messageText.trim()) {
      return;
    }

    const parsed = parseAddress(counterpartyAddress);
    if (!parsed) {
      setError("Invalid recipient address");
      return;
    }

    // Store message text before clearing (in case of success)
    const textToSend = messageText;

    setError(null);
    setPhase("preparing");

    try {
      const sessionToken = getSessionToken(vaultId);
      if (!sessionToken) {
        throw new Error("No session token available");
      }

      // Step 1: Get my engagement key for sending
      const myClient = await createClientFromDomain(vaultDomain, {
        sessionToken,
      });

      const myKey = await myClient.api.getEngagementKeyForSending({
        vaultId,
        counterpartyAddress,
      });

      // Step 2: Derive my engagement private key (needed for signing)
      const myPrivKey = await deriveEngagementPrivKey(
        vaultId,
        vaultDomain,
        myKey.engagementKeyId,
        myKey.engagementPubKey,
      );

      // Step 3: Get PoW challenge from recipient's server (with addresses for difficulty resolution)
      const recipientClient = await createClientFromDomain(parsed.domain);
      const challenge = await recipientClient.api.getPowChallenge({
        recipientAddress: counterpartyAddress,
        senderAddress: ownerAddress,
      });

      // Step 4: Mine PoW with the difficulty required by the recipient
      setPhase("mining");
      const powResult = await miner.start({
        domain: parsed.domain,
        difficulty: challenge.difficulty,
        challengeId: challenge.id,
        header: challenge.header,
        target: challenge.target,
      });

      if (!powResult) {
        throw new Error("Mining failed or was cancelled");
      }

      // Step 5: Sign the solved hash with our engagement private key
      const solvedHashBuf = FixedBuf.fromHex(32, powResult.hash);
      const signatureNonce = FixedBuf.fromRandom(32);
      const signature = sign(solvedHashBuf, myPrivKey, signatureNonce);

      // Step 6: Get counterparty's engagement key (with PoW proof and signature)
      const theirKey = await recipientClient.api.getCounterpartyEngagementKey({
        recipientAddress: counterpartyAddress,
        senderAddress: ownerAddress,
        senderPubKey: myKey.engagementPubKey,
        powChallengeId: powResult.challengeId,
        solvedHeader: powResult.solvedHeader,
        solvedHash: powResult.hash,
        signature: signature.toHex(),
      });

      // Step 7: Encrypt message
      setPhase("sending");

      const theirPubKey = FixedBuf.fromHex(33, theirKey.engagementPubKey);
      const content = createTextMessage(textToSend);
      const encryptedContent = encryptMessage(content, myPrivKey, theirPubKey);

      // Step 8: Send message to recipient's server (PoW reference only)
      await recipientClient.api.sendMessage({
        recipientAddress: counterpartyAddress,
        senderAddress: ownerAddress,
        encryptedContent,
        senderEngagementPubKey: myKey.engagementPubKey,
        recipientEngagementPubKey: theirKey.engagementPubKey,
        powChallengeId: powResult.challengeId,
      });

      // Step 6: Save sent message to our vault
      setPhase("saving");

      // Get or create our channel (with status "saved")
      const senderChannel = await myClient.api.getSenderChannel({
        vaultId,
        counterpartyAddress,
      });

      // Get vault key for encryption
      const vaultKey = getVaultKey(vaultId);

      // Create secret blob for the message
      const messageSecretData: SecretBlobData = {
        name: `Message to ${counterpartyAddress}`,
        type: "message",
        deleted: false,
        messageData: {
          direction: "sent",
          counterpartyAddress,
          myEngagementPubKey: myKey.engagementPubKey,
          theirEngagementPubKey: theirKey.engagementPubKey,
          content,
          timestamp: Date.now(),
        },
      };

      // Push to server (uses the channel's secretId)
      await pushSecretUpdate({
        vaultId,
        secretId: senderChannel.secretId,
        secretData: messageSecretData,
        vaultKey,
        apiClient: myClient,
        isRead: true, // Messages I send are already "read"
      });

      // Success - reset state
      setMessageText("");
      setPhase("idle");
      miner.reset();

      onMessageSent?.();
    } catch (err) {
      console.error("Error sending message:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
      setPhase("error");
    }
  };

  const handleReset = (): void => {
    setPhase("idle");
    setError(null);
    miner.reset();
  };

  const isProcessing = phase !== "idle" && phase !== "error";

  return (
    <div>
      {phase === "error" && (
        <div className="border-destructive/50 bg-destructive/10 mb-3 rounded-lg border p-3">
          <p className="text-destructive text-sm">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={handleReset}
          >
            Try Again
          </Button>
        </div>
      )}

      {isProcessing ? (
        <div className="flex items-center justify-center gap-3 py-4">
          <Loader2 className="text-primary h-5 w-5 animate-spin" />
          <div className="text-sm">
            {phase === "preparing" && "Exchanging keys..."}
            {phase === "mining" && (
              <span className="flex items-center gap-2">
                Mining PoW
                {miner.webGpuAvailable !== null && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    {miner.webGpuAvailable ? (
                      <Zap className="h-3 w-3" />
                    ) : (
                      <Cpu className="h-3 w-3" />
                    )}
                  </span>
                )}
              </span>
            )}
            {phase === "sending" && "Sending..."}
            {phase === "saving" && "Saving..."}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex max-h-[120px] min-h-[44px] flex-1 resize-none rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!messageText.trim()}
            className="h-11 w-11 flex-shrink-0"
          >
            <Send size={18} />
          </Button>
        </form>
      )}
    </div>
  );
}
