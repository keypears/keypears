import { useState, useEffect, useRef } from "react";
import { Send, Loader2, Zap, Cpu } from "lucide-react";
import { Button } from "~app/components/ui/button";
import { createClientFromDomain } from "@keypears/api-server/client";
import { getSessionToken } from "~app/lib/vault-store";
import { usePowMiner } from "~app/lib/use-pow-miner";
import { deriveEngagementPrivKey } from "~app/lib/engagement-key-utils";
import {
  encryptMessage,
  createTextMessage,
} from "~app/lib/message-encryption";
import { FixedBuf } from "@keypears/lib";

// Default messaging difficulty
const DEFAULT_MESSAGING_DIFFICULTY = "4194304"; // 2^22

type SendPhase = "idle" | "preparing" | "mining" | "sending" | "error";

interface ComposeBoxProps {
  vaultId: string;
  vaultDomain: string;
  ownerAddress: string;
  counterpartyAddress: string;
  onMessageSent?: () => void;
}

function parseAddress(address: string): { name: string; domain: string } | null {
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

  // Keys obtained during preparation
  const [myEngagementKeyId, setMyEngagementKeyId] = useState<string | null>(null);
  const [myEngagementPubKey, setMyEngagementPubKey] = useState<string | null>(null);
  const [theirEngagementPubKey, setTheirEngagementPubKey] = useState<string | null>(null);
  const [recipientDomain, setRecipientDomain] = useState<string | null>(null);
  const [difficulty] = useState<string>(DEFAULT_MESSAGING_DIFFICULTY);

  const hasStartedMining = useRef(false);
  const hasStartedSending = useRef(false);
  const currentMessageText = useRef("");

  // PoW miner
  const miner = usePowMiner({
    domain: recipientDomain ?? "",
    difficulty,
    preferWgsl: true,
    verifyWithServer: false,
  });

  // Start mining when preparation is complete
  useEffect(() => {
    if (
      phase === "preparing" &&
      myEngagementPubKey &&
      theirEngagementPubKey &&
      recipientDomain &&
      !hasStartedMining.current
    ) {
      hasStartedMining.current = true;
      setPhase("mining");
      miner.start();
    }
  }, [phase, myEngagementPubKey, theirEngagementPubKey, recipientDomain, miner]);

  // When mining succeeds, send the message
  useEffect(() => {
    if (
      miner.status !== "success" ||
      !miner.result ||
      hasStartedSending.current
    ) {
      return;
    }

    hasStartedSending.current = true;
    setPhase("sending");

    const sendMessage = async (): Promise<void> => {
      try {
        const parsed = parseAddress(counterpartyAddress);
        if (!parsed) {
          throw new Error("Invalid recipient address");
        }

        // Derive my private key for encryption
        const myPrivKey = await deriveEngagementPrivKey(
          vaultId,
          vaultDomain,
          myEngagementKeyId!,
          myEngagementPubKey!,
        );

        // Parse their public key
        const theirPubKey = FixedBuf.fromHex(33, theirEngagementPubKey!);

        // Encrypt the message
        const content = createTextMessage(currentMessageText.current);
        const encryptedContent = encryptMessage(content, myPrivKey, theirPubKey);

        // Send to recipient's server
        const recipientClient = await createClientFromDomain(parsed.domain);
        await recipientClient.api.sendMessage({
          recipientAddress: counterpartyAddress,
          senderAddress: ownerAddress,
          encryptedContent,
          senderEngagementPubKey: myEngagementPubKey!,
          recipientEngagementPubKey: theirEngagementPubKey!,
          powChallengeId: miner.result!.challengeId,
          solvedHeader: miner.result!.solvedHeader,
          solvedHash: miner.result!.hash,
        });

        // Reset state
        setMessageText("");
        setPhase("idle");
        setMyEngagementKeyId(null);
        setMyEngagementPubKey(null);
        setTheirEngagementPubKey(null);
        setRecipientDomain(null);
        hasStartedMining.current = false;
        hasStartedSending.current = false;
        currentMessageText.current = "";
        miner.reset();

        onMessageSent?.();
      } catch (err) {
        console.error("Error sending message:", err);
        setError(err instanceof Error ? err.message : "Failed to send message");
        setPhase("error");
      }
    };

    sendMessage();
  }, [
    miner.status,
    miner.result,
    counterpartyAddress,
    ownerAddress,
    vaultId,
    vaultDomain,
    myEngagementKeyId,
    myEngagementPubKey,
    theirEngagementPubKey,
    miner,
    onMessageSent,
  ]);

  // Handle mining errors
  useEffect(() => {
    if (miner.status === "error" && miner.error) {
      setError(miner.error);
      setPhase("error");
    }
  }, [miner.status, miner.error]);

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

    // Store the message text for later use
    currentMessageText.current = messageText;

    setError(null);
    setPhase("preparing");
    setRecipientDomain(parsed.domain);

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
      setMyEngagementKeyId(myKey.engagementKeyId);
      setMyEngagementPubKey(myKey.engagementPubKey);

      // Step 2: Get counterparty's engagement key (from their server)
      const recipientClient = await createClientFromDomain(parsed.domain);
      const theirKey = await recipientClient.api.getCounterpartyEngagementKey({
        recipientAddress: counterpartyAddress,
        senderAddress: ownerAddress,
        senderPubKey: myKey.engagementPubKey,
      });
      setTheirEngagementPubKey(theirKey.engagementPubKey);
    } catch (err) {
      console.error("Error preparing message:", err);
      setError(err instanceof Error ? err.message : "Failed to prepare message");
      setPhase("error");
    }
  };

  const handleReset = (): void => {
    setPhase("idle");
    setError(null);
    setMyEngagementKeyId(null);
    setMyEngagementPubKey(null);
    setTheirEngagementPubKey(null);
    setRecipientDomain(null);
    hasStartedMining.current = false;
    hasStartedSending.current = false;
    currentMessageText.current = "";
    miner.reset();
  };

  const isProcessing = phase !== "idle" && phase !== "error";

  return (
    <div className="border-border bg-card rounded-lg border p-3">
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
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[44px] max-h-[120px] flex-1 resize-none rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
