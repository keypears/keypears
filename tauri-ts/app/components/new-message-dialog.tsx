import { useState, useEffect, useRef } from "react";
import { Loader2, Send, Zap, Cpu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~app/components/ui/sheet";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { Label } from "~app/components/ui/label";
import { createClientFromDomain } from "@keypears/api-server/client";
import { getSessionToken } from "~app/lib/vault-store";
import { usePowMiner } from "~app/lib/use-pow-miner";
import { deriveEngagementPrivKey } from "~app/lib/engagement-key-utils";
import {
  encryptMessage,
  createTextMessage,
} from "~app/lib/message-encryption";
import { FixedBuf } from "@keypears/lib";

// Default messaging difficulty (can be overridden by recipient settings)
const DEFAULT_MESSAGING_DIFFICULTY = "4194304"; // 2^22

type SendPhase =
  | "input"
  | "preparing"
  | "mining"
  | "sending"
  | "success"
  | "error";

interface NewMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultId: string;
  vaultDomain: string;
  ownerAddress: string;
  onMessageSent?: () => void;
}

function parseAddress(address: string): { name: string; domain: string } | null {
  const parts = address.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { name: parts[0], domain: parts[1] };
}

export function NewMessageDialog({
  open,
  onOpenChange,
  vaultId,
  vaultDomain,
  ownerAddress,
  onMessageSent,
}: NewMessageDialogProps): React.ReactElement {
  const [recipientAddress, setRecipientAddress] = useState("");
  const [messageText, setMessageText] = useState("");
  const [phase, setPhase] = useState<SendPhase>("input");
  const [error, setError] = useState<string | null>(null);

  // Keys obtained during preparation
  const [myEngagementKeyId, setMyEngagementKeyId] = useState<string | null>(null);
  const [myEngagementPubKey, setMyEngagementPubKey] = useState<string | null>(null);
  const [theirEngagementPubKey, setTheirEngagementPubKey] = useState<string | null>(null);
  const [recipientDomain, setRecipientDomain] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string>(DEFAULT_MESSAGING_DIFFICULTY);

  const hasStartedMining = useRef(false);
  const hasStartedSending = useRef(false);

  // PoW miner - only active when we have recipient domain and are in preparing/mining phase
  const miner = usePowMiner({
    domain: recipientDomain ?? "",
    difficulty,
    preferWgsl: true,
    verifyWithServer: false,
  });

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setRecipientAddress("");
      setMessageText("");
      setPhase("input");
      setError(null);
      setMyEngagementKeyId(null);
      setMyEngagementPubKey(null);
      setTheirEngagementPubKey(null);
      setRecipientDomain(null);
      setDifficulty(DEFAULT_MESSAGING_DIFFICULTY);
      hasStartedMining.current = false;
      hasStartedSending.current = false;
      miner.reset();
    }
  }, [open, miner]);

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
        const parsed = parseAddress(recipientAddress);
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
        const content = createTextMessage(messageText);
        const encryptedContent = encryptMessage(content, myPrivKey, theirPubKey);

        // Send to recipient's server
        const recipientClient = await createClientFromDomain(parsed.domain);
        await recipientClient.api.sendMessage({
          recipientAddress,
          senderAddress: ownerAddress,
          encryptedContent,
          senderEngagementPubKey: myEngagementPubKey!,
          recipientEngagementPubKey: theirEngagementPubKey!,
          powChallengeId: miner.result!.challengeId,
          solvedHeader: miner.result!.solvedHeader,
          solvedHash: miner.result!.hash,
        });

        setPhase("success");

        // Close dialog after a brief delay
        setTimeout(() => {
          onOpenChange(false);
          onMessageSent?.();
        }, 1500);
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
    recipientAddress,
    ownerAddress,
    vaultId,
    vaultDomain,
    myEngagementKeyId,
    myEngagementPubKey,
    theirEngagementPubKey,
    messageText,
    onOpenChange,
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

    // Validate inputs
    const parsed = parseAddress(recipientAddress);
    if (!parsed) {
      setError("Invalid address format. Use name@domain.com");
      return;
    }

    if (!messageText.trim()) {
      setError("Please enter a message");
      return;
    }

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
        counterpartyAddress: recipientAddress,
      });
      setMyEngagementKeyId(myKey.engagementKeyId);
      setMyEngagementPubKey(myKey.engagementPubKey);

      // Step 2: Get counterparty's engagement key (from their server)
      const recipientClient = await createClientFromDomain(parsed.domain);
      const theirKey = await recipientClient.api.getCounterpartyEngagementKey({
        recipientAddress,
        senderAddress: ownerAddress,
        senderPubKey: myKey.engagementPubKey,
      });
      setTheirEngagementPubKey(theirKey.engagementPubKey);

      // Note: Could also fetch recipient's difficulty setting here
      // For now, use default difficulty
    } catch (err) {
      console.error("Error preparing message:", err);
      setError(err instanceof Error ? err.message : "Failed to prepare message");
      setPhase("error");
    }
  };

  const handleCancel = (): void => {
    if (phase === "mining") {
      miner.cancel();
    }
    onOpenChange(false);
  };

  const handleRetry = (): void => {
    setPhase("input");
    setError(null);
    hasStartedMining.current = false;
    hasStartedSending.current = false;
    miner.reset();
  };

  const formatDifficulty = (diff: string): string => {
    const n = BigInt(diff);
    const millions = Number(n / 1000000n);
    return millions >= 1 ? `${millions}M` : diff;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh]">
        <SheetHeader>
          <SheetTitle>New Message</SheetTitle>
          <SheetDescription>
            Send an encrypted message to another KeyPears user
          </SheetDescription>
        </SheetHeader>

        <div className="p-4">
          {phase === "input" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recipient">Recipient</Label>
                <Input
                  id="recipient"
                  type="text"
                  placeholder="name@domain.com"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <textarea
                  id="message"
                  className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Type your message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                />
              </div>

              {error && (
                <div className="border-destructive/50 bg-destructive/10 rounded-lg border p-3">
                  <p className="text-destructive text-sm">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1">
                  <Send size={16} className="mr-2" />
                  Send
                </Button>
              </div>
            </form>
          )}

          {(phase === "preparing" || phase === "mining" || phase === "sending") && (
            <div className="space-y-4 py-8 text-center">
              <div className="flex justify-center">
                <div className="bg-primary/10 rounded-full p-4">
                  <Loader2 className="text-primary h-8 w-8 animate-spin" />
                </div>
              </div>

              <div>
                <h3 className="font-semibold">
                  {phase === "preparing" && "Preparing..."}
                  {phase === "mining" && "Mining..."}
                  {phase === "sending" && "Sending..."}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {phase === "preparing" && "Exchanging keys..."}
                  {phase === "mining" && (
                    <>
                      Solving proof of work
                      {miner.webGpuAvailable !== null && (
                        <span className="flex items-center justify-center gap-1 text-xs">
                          {miner.webGpuAvailable ? (
                            <>
                              <Zap className="h-3 w-3" /> GPU
                            </>
                          ) : (
                            <>
                              <Cpu className="h-3 w-3" /> CPU
                            </>
                          )}
                        </span>
                      )}
                    </>
                  )}
                  {phase === "sending" && "Encrypting and sending message..."}
                </p>
              </div>

              {phase === "mining" && miner.hashesComputed > 0 && (
                <p className="text-muted-foreground font-mono text-xs">
                  {miner.hashesComputed.toLocaleString()} hashes (
                  {(miner.elapsedMs / 1000).toFixed(1)}s)
                  <br />
                  Difficulty: {formatDifficulty(difficulty)}
                </p>
              )}

              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          )}

          {phase === "success" && (
            <div className="space-y-4 py-8 text-center">
              <div className="flex justify-center">
                <div className="bg-green-500/10 rounded-full p-4">
                  <Send className="h-8 w-8 text-green-500" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold">Message Sent</h3>
                <p className="text-muted-foreground text-sm">
                  Your encrypted message has been delivered.
                </p>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-4 py-8 text-center">
              <div className="border-destructive/50 bg-destructive/10 rounded-lg border p-4">
                <p className="text-destructive text-sm">{error}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleRetry}>
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
