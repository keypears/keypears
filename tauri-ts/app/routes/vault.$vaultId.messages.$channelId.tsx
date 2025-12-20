import type { Route } from "./+types/vault.$vaultId.messages.$channelId";
import { useState, useEffect } from "react";
import { Link, href } from "react-router";
import {
  ArrowLeft,
  MessageSquare,
  Bookmark,
  EyeOff,
  Clock,
  Loader2,
} from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { createClientFromDomain } from "@keypears/api-server/client";
import {
  getUnlockedVault,
  getSessionToken,
} from "~app/lib/vault-store";
import { deriveEngagementPrivKeyByPubKey } from "~app/lib/engagement-key-utils";
import { decryptMessage, type MessageContent } from "~app/lib/message-encryption";
import { FixedBuf } from "@keypears/lib";
import type { ChannelStatus } from "@keypears/api-server";
import { ComposeBox } from "~app/components/compose-box";

interface Message {
  id: string;
  senderAddress: string;
  orderInChannel: number;
  encryptedContent: string;
  senderEngagementPubKey: string;
  recipientEngagementPubKey: string;
  isRead: boolean;
  createdAt: Date;
}

interface DecryptedMessage extends Message {
  decryptedContent: MessageContent | null;
  decryptionError: string | null;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const timestamp = date.getTime();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

function MessageBubble({
  message,
  ownerAddress,
}: {
  message: DecryptedMessage;
  ownerAddress: string;
}) {
  const isFromMe = message.senderAddress === ownerAddress;

  return (
    <div className={`flex ${isFromMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          isFromMe
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {message.decryptionError ? (
          <p className="text-sm italic opacity-70">
            Failed to decrypt: {message.decryptionError}
          </p>
        ) : message.decryptedContent ? (
          <p className="text-sm whitespace-pre-wrap">
            {message.decryptedContent.text}
          </p>
        ) : (
          <p className="text-sm italic opacity-70">Decrypting...</p>
        )}
        <p
          className={`mt-1 text-xs ${
            isFromMe ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {formatRelativeTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const { vaultId, channelId } = params;

  const vault = getUnlockedVault(vaultId);
  if (!vault) {
    throw new Response("Vault not unlocked", { status: 401 });
  }

  const sessionToken = getSessionToken(vaultId);
  if (!sessionToken) {
    throw new Response("No session", { status: 401 });
  }

  const client = await createClientFromDomain(vault.vaultDomain, {
    sessionToken,
  });

  const ownerAddress = `${vault.vaultName}@${vault.vaultDomain}`;

  // Fetch channel info and messages
  const [channelsResponse, messagesResponse] = await Promise.all([
    client.api.getChannels({
      vaultId,
      ownerAddress,
      limit: 100, // Get more to find our channel
    }),
    client.api.getChannelMessages({
      vaultId,
      channelId: channelId!,
      limit: 50,
    }),
  ]);

  // Find the channel in the list
  const channel = channelsResponse.channels.find((c) => c.id === channelId);

  return {
    vaultId: vaultId!,
    channelId: channelId!,
    vaultDomain: vault.vaultDomain,
    ownerAddress,
    channel: channel ?? null,
    messages: messagesResponse.messages,
    hasMore: messagesResponse.hasMore,
  };
}

export default function ChannelDetail({ loaderData }: Route.ComponentProps) {
  const {
    vaultId,
    channelId,
    vaultDomain,
    ownerAddress,
    channel,
    messages: initialMessages,
    hasMore: initialHasMore,
  } = loaderData;

  const [messages, setMessages] = useState<DecryptedMessage[]>(
    initialMessages.map((m) => ({
      ...m,
      decryptedContent: null,
      decryptionError: null,
    })),
  );
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(true);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>(
    channel?.status ?? "pending",
  );
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decrypt messages on load
  useEffect(() => {
    const decryptMessages = async (): Promise<void> => {
      setIsDecrypting(true);

      const decrypted = await Promise.all(
        messages.map(async (msg) => {
          // Skip if already decrypted
          if (msg.decryptedContent || msg.decryptionError) {
            return msg;
          }

          try {
            // Derive my private key using the recipient engagement pubkey
            const myPrivKey = await deriveEngagementPrivKeyByPubKey(
              vaultId,
              vaultDomain,
              msg.recipientEngagementPubKey,
            );

            // Parse sender's public key
            const theirPubKey = FixedBuf.fromHex(33, msg.senderEngagementPubKey);

            // Decrypt the message
            const content = decryptMessage(
              msg.encryptedContent,
              myPrivKey,
              theirPubKey,
            );

            return {
              ...msg,
              decryptedContent: content,
              decryptionError: null,
            };
          } catch (err) {
            console.error("Failed to decrypt message:", err);
            return {
              ...msg,
              decryptedContent: null,
              decryptionError:
                err instanceof Error ? err.message : "Unknown error",
            };
          }
        }),
      );

      setMessages(decrypted);
      setIsDecrypting(false);
    };

    decryptMessages();
  }, [vaultId, vaultDomain]); // Only run on mount, not on messages change

  const handleLoadMore = async (): Promise<void> => {
    if (!hasMore || isLoadingMore) return;

    setIsLoadingMore(true);

    try {
      const sessionToken = getSessionToken(vaultId);
      if (!sessionToken) {
        throw new Error("No session token available");
      }

      const client = await createClientFromDomain(vaultDomain, {
        sessionToken,
      });

      const lastMessage = messages[messages.length - 1];
      const response = await client.api.getChannelMessages({
        vaultId,
        channelId,
        limit: 50,
        beforeOrder: lastMessage?.orderInChannel,
      });

      // Add new messages and decrypt them
      const newMessages: DecryptedMessage[] = response.messages.map((m) => ({
        ...m,
        decryptedContent: null,
        decryptionError: null,
      }));

      // Decrypt the new messages
      const decrypted = await Promise.all(
        newMessages.map(async (msg) => {
          try {
            const myPrivKey = await deriveEngagementPrivKeyByPubKey(
              vaultId,
              vaultDomain,
              msg.recipientEngagementPubKey,
            );
            const theirPubKey = FixedBuf.fromHex(33, msg.senderEngagementPubKey);
            const content = decryptMessage(
              msg.encryptedContent,
              myPrivKey,
              theirPubKey,
            );
            return { ...msg, decryptedContent: content, decryptionError: null };
          } catch (err) {
            return {
              ...msg,
              decryptedContent: null,
              decryptionError:
                err instanceof Error ? err.message : "Unknown error",
            };
          }
        }),
      );

      setMessages((prev) => [...prev, ...decrypted]);
      setHasMore(response.hasMore);
    } catch (err) {
      console.error("Error loading more messages:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load more messages",
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleStatusChange = async (newStatus: ChannelStatus): Promise<void> => {
    if (isUpdatingStatus) return;

    setIsUpdatingStatus(true);

    try {
      const sessionToken = getSessionToken(vaultId);
      if (!sessionToken) {
        throw new Error("No session token available");
      }

      const client = await createClientFromDomain(vaultDomain, {
        sessionToken,
      });

      await client.api.updateChannelStatus({
        vaultId,
        channelId,
        status: newStatus,
      });

      setChannelStatus(newStatus);
    } catch (err) {
      console.error("Error updating channel status:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update channel status",
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleMessageSent = (): void => {
    // Refresh the page to load new messages
    window.location.reload();
  };

  const counterpartyAddress = channel?.counterpartyAddress ?? "Unknown";

  return (
    <>
      <Navbar vaultId={vaultId} />
      <div className="mx-auto flex max-w-2xl flex-col px-4 py-4">
        {/* Header with back button and channel info */}
        <div className="mb-4 flex items-center gap-3">
          <Link
            to={href("/vault/:vaultId/messages", { vaultId })}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="bg-primary/10 flex-shrink-0 rounded-full p-2">
              <MessageSquare className="text-primary h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-semibold">{counterpartyAddress}</h1>
              <p className="text-muted-foreground text-sm">
                {messages.length} messages
              </p>
            </div>
          </div>
        </div>

        {/* Status actions */}
        <div className="border-border mb-4 flex gap-2 rounded-lg border p-2">
          <Button
            variant={channelStatus === "saved" ? "default" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => handleStatusChange("saved")}
            disabled={isUpdatingStatus}
          >
            <Bookmark size={14} className="mr-1" />
            Save
          </Button>
          <Button
            variant={channelStatus === "pending" ? "default" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => handleStatusChange("pending")}
            disabled={isUpdatingStatus}
          >
            <Clock size={14} className="mr-1" />
            Pending
          </Button>
          <Button
            variant={channelStatus === "ignored" ? "default" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => handleStatusChange("ignored")}
            disabled={isUpdatingStatus}
          >
            <EyeOff size={14} className="mr-1" />
            Ignore
          </Button>
        </div>

        {error && (
          <div className="border-destructive/50 bg-destructive/10 mb-4 rounded-lg border p-4">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {/* Message list */}
        <div className="mb-4 flex-1 space-y-3">
          {isDecrypting && messages.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              <span className="text-muted-foreground text-sm">
                Decrypting messages...
              </span>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="border-border bg-card rounded-lg border p-8 text-center">
              <p className="text-muted-foreground">No messages yet</p>
            </div>
          ) : (
            <>
              {/* Messages in reverse chronological order (newest first) */}
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  ownerAddress={ownerAddress}
                />
              ))}

              {/* Load more button */}
              {hasMore && (
                <div className="text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? "Loading..." : "Load older messages"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Compose box */}
        <ComposeBox
          vaultId={vaultId}
          vaultDomain={vaultDomain}
          ownerAddress={ownerAddress}
          counterpartyAddress={counterpartyAddress}
          onMessageSent={handleMessageSent}
        />
      </div>
    </>
  );
}
