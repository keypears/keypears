import type { Route } from "./+types/vault.$vaultId.messages.$channelId";
import { useState, useEffect, useRef } from "react";
import { Link, href, useRevalidator } from "react-router";
import {
  ArrowLeft,
  MessageSquare,
  Bookmark,
  EyeOff,
  Clock,
} from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { useUnreadCount } from "~app/contexts/sync-context";
import { Button } from "~app/components/ui/button";
import { createClientFromDomain } from "@keypears/api-server/client";
import {
  getUnlockedVault,
  getSessionToken,
  getVaultKey,
} from "~app/lib/vault-store";
import { deriveEngagementPrivKeyByPubKey } from "~app/lib/engagement-key-utils";
import { decryptMessage } from "~app/lib/message-encryption";
import { decryptSecretUpdateBlob } from "~app/lib/secret-encryption";
import { FixedBuf } from "@keypears/lib";
import type { ChannelStatus } from "@keypears/api-server";
import { ComposeBox } from "~app/components/compose-box";
import { getSecretUpdatesBySecretId } from "~app/db/models/password";

/**
 * Unified display message type that works for both vault and inbox sources
 */
interface DisplayMessage {
  id: string;
  direction: "sent" | "received";
  text: string;
  timestamp: Date;
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
}: {
  message: DisplayMessage;
}) {
  const isFromMe = message.direction === "sent";

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
        ) : (
          <p className="text-sm whitespace-pre-wrap">
            {message.text}
          </p>
        )}
        <p
          className={`mt-1 text-xs ${
            isFromMe ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {formatRelativeTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

/**
 * Load messages from local vault for saved channels
 */
async function loadVaultMessages(
  vaultId: string,
  secretId: string,
): Promise<DisplayMessage[]> {
  const vaultKey = getVaultKey(vaultId);
  const updates = await getSecretUpdatesBySecretId(vaultId, secretId);

  const messages: DisplayMessage[] = [];

  for (const update of updates) {
    try {
      const blobData = decryptSecretUpdateBlob(update.encryptedBlob, vaultKey);

      if (blobData.type !== "message" || !blobData.messageData) {
        continue;
      }

      const msgData = blobData.messageData;
      messages.push({
        id: update.id,
        direction: msgData.direction,
        text: msgData.content.text,
        timestamp: new Date(msgData.timestamp),
        decryptionError: null,
      });
    } catch (err) {
      console.error("Failed to decrypt vault message:", err);
      messages.push({
        id: update.id,
        direction: "received", // Assume received for errors
        text: "",
        timestamp: new Date(update.createdAt),
        decryptionError: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Sort by timestamp descending (newest first for reverse chronological display)
  return messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Inbox message from server (for pending/ignored channels)
 */
interface InboxMessage {
  id: string;
  senderAddress: string;
  orderInChannel: number;
  encryptedContent: string;
  senderEngagementPubKey: string;
  recipientEngagementPubKey: string;
  isRead: boolean;
  createdAt: Date;
}

/**
 * Decrypt inbox messages using DH keys
 */
async function decryptInboxMessages(
  messages: InboxMessage[],
  vaultId: string,
  vaultDomain: string,
  ownerAddress: string,
): Promise<DisplayMessage[]> {
  const result: DisplayMessage[] = [];

  for (const msg of messages) {
    const isFromMe = msg.senderAddress === ownerAddress;

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

      result.push({
        id: msg.id,
        direction: isFromMe ? "sent" : "received",
        text: content.text,
        timestamp: msg.createdAt,
        decryptionError: null,
      });
    } catch (err) {
      console.error("Failed to decrypt inbox message:", err);
      result.push({
        id: msg.id,
        direction: isFromMe ? "sent" : "received",
        text: "",
        timestamp: msg.createdAt,
        decryptionError: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
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

  // Fetch channel info
  const channelsResponse = await client.api.getChannels({
    vaultId,
    ownerAddress,
    limit: 100, // Get more to find our channel
  });

  // Find the channel in the list
  const channel = channelsResponse.channels.find((c) => c.id === channelId);

  if (!channel) {
    throw new Response("Channel not found", { status: 404 });
  }

  // Load messages based on channel status
  let messages: DisplayMessage[];
  let hasMore = false;
  let inboxMessages: InboxMessage[] | null = null;

  if (channel.status === "saved") {
    // For saved channels: query local vault
    messages = await loadVaultMessages(vaultId!, channel.secretId);
  } else {
    // For pending/ignored channels: query server inbox
    const messagesResponse = await client.api.getChannelMessages({
      vaultId,
      channelId: channelId!,
      limit: 50,
    });

    // Store raw inbox messages for load more functionality
    inboxMessages = messagesResponse.messages;
    hasMore = messagesResponse.hasMore;

    // Decrypt inbox messages
    messages = await decryptInboxMessages(
      messagesResponse.messages,
      vaultId!,
      vault.vaultDomain,
      ownerAddress,
    );
  }

  return {
    vaultId: vaultId!,
    channelId: channelId!,
    vaultDomain: vault.vaultDomain,
    ownerAddress,
    channel,
    messages,
    hasMore,
    // Store last inbox message order for pagination (only for non-saved channels)
    lastInboxOrder: inboxMessages && inboxMessages.length > 0
      ? inboxMessages[inboxMessages.length - 1]?.orderInChannel
      : undefined,
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
    lastInboxOrder: initialLastOrder,
  } = loaderData;

  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [lastInboxOrder, setLastInboxOrder] = useState(initialLastOrder);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>(
    channel.status,
  );
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revalidator = useRevalidator();

  // Reload messages when status changes to "saved" (need to switch from inbox to vault)
  useEffect(() => {
    if (channelStatus === "saved" && channel.status !== "saved") {
      // Status just changed to saved - reload from vault
      revalidator.revalidate();
    }
  }, [channelStatus, channel.status, revalidator]);

  // Sync state with loader data when it changes (e.g., after revalidation)
  useEffect(() => {
    setMessages(initialMessages);
    setHasMore(initialHasMore);
    setLastInboxOrder(initialLastOrder);
  }, [initialMessages, initialHasMore, initialLastOrder]);

  // Auto-refresh when new messages arrive via background sync
  const globalUnreadCount = useUnreadCount(vaultId);
  const prevUnreadCount = useRef(globalUnreadCount);

  useEffect(() => {
    if (globalUnreadCount > prevUnreadCount.current) {
      revalidator.revalidate();
    }
    prevUnreadCount.current = globalUnreadCount;
  }, [globalUnreadCount, revalidator]);

  const handleLoadMore = async (): Promise<void> => {
    // Load more only works for non-saved channels (inbox pagination)
    if (!hasMore || isLoadingMore || channelStatus === "saved") return;

    setIsLoadingMore(true);

    try {
      const sessionToken = getSessionToken(vaultId);
      if (!sessionToken) {
        throw new Error("No session token available");
      }

      const client = await createClientFromDomain(vaultDomain, {
        sessionToken,
      });

      const response = await client.api.getChannelMessages({
        vaultId,
        channelId,
        limit: 50,
        beforeOrder: lastInboxOrder,
      });

      // Decrypt new messages
      const newMessages = await decryptInboxMessages(
        response.messages,
        vaultId,
        vaultDomain,
        ownerAddress,
      );

      setMessages((prev) => [...prev, ...newMessages]);
      setHasMore(response.hasMore);

      if (response.messages.length > 0) {
        setLastInboxOrder(response.messages[response.messages.length - 1]?.orderInChannel);
      }
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
    revalidator.revalidate();
  };

  const handleChannelStatusChanged = (newStatus: "saved"): void => {
    setChannelStatus(newStatus);
  };

  const counterpartyAddress = channel.counterpartyAddress;

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
            variant={channelStatus === "saved" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => handleStatusChange("saved")}
            disabled={isUpdatingStatus}
          >
            <Bookmark size={14} className="mr-1" />
            Save
          </Button>
          <Button
            variant={channelStatus === "pending" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => handleStatusChange("pending")}
            disabled={isUpdatingStatus}
          >
            <Clock size={14} className="mr-1" />
            Pending
          </Button>
          <Button
            variant={channelStatus === "ignored" ? "secondary" : "ghost"}
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

        {/* Compose box - at top before messages */}
        <ComposeBox
          vaultId={vaultId}
          vaultDomain={vaultDomain}
          ownerAddress={ownerAddress}
          counterpartyAddress={counterpartyAddress}
          channelId={channelId}
          channelStatus={channelStatus}
          onMessageSent={handleMessageSent}
          onChannelStatusChanged={handleChannelStatusChanged}
        />

        {/* Message list */}
        <div className="mt-4 flex-1 space-y-3">
          {messages.length === 0 ? (
            <div className="border-border bg-card rounded-lg border p-8 text-center">
              <p className="text-muted-foreground">No messages yet</p>
            </div>
          ) : (
            <>
              {/* Messages in reverse chronological order (newest first at top) */}
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                />
              ))}

              {/* Load more button - only for non-saved channels */}
              {hasMore && channelStatus !== "saved" && (
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
      </div>
    </>
  );
}
