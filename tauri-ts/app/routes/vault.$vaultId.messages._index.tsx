import type { Route } from "./+types/vault.$vaultId.messages._index";
import { useState } from "react";
import { Link, href, useRevalidator } from "react-router";
import { MessageSquare, Plus, ChevronRight, Inbox } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { createClientFromDomain } from "@keypears/api-server/client";
import {
  getUnlockedVault,
  getSessionToken,
} from "~app/lib/vault-store";
import type { ChannelStatus } from "@keypears/api-server";
import { NewMessageDialog } from "~app/components/new-message-dialog";

interface Channel {
  id: string;
  counterpartyAddress: string;
  status: ChannelStatus;
  minDifficulty: string | null;
  unreadCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type StatusFilter = "all" | ChannelStatus;

function formatRelativeTime(date: Date | null): string {
  if (!date) return "";

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

function ChannelCard({
  channel,
  vaultId,
}: {
  channel: Channel;
  vaultId: string;
}) {
  // Get status badge color
  const statusBadgeClass =
    channel.status === "saved"
      ? "bg-green-500/10 text-green-600 dark:text-green-400"
      : channel.status === "ignored"
        ? "bg-gray-500/10 text-gray-600 dark:text-gray-400"
        : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";

  const statusLabel =
    channel.status.charAt(0).toUpperCase() + channel.status.slice(1);

  return (
    <Link
      to={href("/vault/:vaultId/messages/:channelId", {
        vaultId,
        channelId: channel.id,
      })}
      className="border-border bg-card hover:bg-muted/50 block rounded-lg border p-4 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="bg-primary/10 flex-shrink-0 rounded-full p-2">
            <MessageSquare className="text-primary h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">
                {channel.counterpartyAddress}
              </span>
              {channel.unreadCount > 0 && (
                <span className="bg-primary text-primary-foreground flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
                  {channel.unreadCount}
                </span>
              )}
            </div>
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass}`}
              >
                {statusLabel}
              </span>
              {channel.lastMessageAt && (
                <span>{formatRelativeTime(channel.lastMessageAt)}</span>
              )}
            </div>
          </div>
        </div>
        <ChevronRight className="text-muted-foreground h-5 w-5 flex-shrink-0" />
      </div>
    </Link>
  );
}

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "saved", label: "Saved" },
  { value: "ignored", label: "Ignored" },
];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;

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

  const response = await client.api.getChannels({
    vaultId,
    ownerAddress,
    limit: 20,
  });

  return {
    vaultId,
    vaultDomain: vault.vaultDomain,
    ownerAddress,
    channels: response.channels,
    hasMore: response.hasMore,
  };
}

export default function VaultMessagesIndex({
  loaderData,
}: Route.ComponentProps) {
  const {
    vaultId,
    vaultDomain,
    ownerAddress,
    channels: initialChannels,
    hasMore: initialHasMore,
  } = loaderData;

  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isNewMessageOpen, setIsNewMessageOpen] = useState(false);
  const revalidator = useRevalidator();

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

      const lastChannel = channels[channels.length - 1];
      const response = await client.api.getChannels({
        vaultId,
        ownerAddress,
        limit: 20,
        beforeUpdatedAt: lastChannel?.updatedAt,
      });

      setChannels((prev) => [...prev, ...response.channels]);
      setHasMore(response.hasMore);
    } catch (err) {
      console.error("Error loading more channels:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load more channels",
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Filter channels by status
  const filteredChannels =
    statusFilter === "all"
      ? channels
      : channels.filter((c) => c.status === statusFilter);

  return (
    <>
      <Navbar vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-4">
        {/* Header with title and new message button */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Messages</h1>
          <Button onClick={() => setIsNewMessageOpen(true)}>
            <Plus size={16} className="mr-2" />
            New Message
          </Button>
        </div>

        {/* Status filter tabs */}
        <div className="border-border mb-4 flex gap-1 rounded-lg border p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="border-destructive/50 bg-destructive/10 mb-4 rounded-lg border p-4">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {/* Channel list */}
        <div className="space-y-2">
          {filteredChannels.length === 0 ? (
            <div className="border-border bg-card rounded-lg border p-8">
              <div className="flex flex-col items-center text-center">
                <div className="bg-primary/10 mb-4 rounded-full p-4">
                  <Inbox className="text-primary h-8 w-8" />
                </div>
                <h2 className="mb-2 text-lg font-semibold">
                  {statusFilter === "all"
                    ? "No messages yet"
                    : `No ${statusFilter} messages`}
                </h2>
                <p className="text-muted-foreground mb-4 text-sm">
                  {statusFilter === "all"
                    ? "Start a conversation by sending a message to someone."
                    : `You don't have any ${statusFilter} channels.`}
                </p>
                {statusFilter === "all" && (
                  <Button onClick={() => setIsNewMessageOpen(true)}>
                    <Plus size={16} className="mr-2" />
                    Send First Message
                  </Button>
                )}
              </div>
            </div>
          ) : (
            filteredChannels.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} vaultId={vaultId} />
            ))
          )}
        </div>

        {/* Load more button */}
        {hasMore && filteredChannels.length > 0 && statusFilter === "all" && (
          <div className="mt-6 text-center">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}
      </div>

      {/* New message dialog */}
      <NewMessageDialog
        open={isNewMessageOpen}
        onOpenChange={setIsNewMessageOpen}
        vaultId={vaultId}
        vaultDomain={vaultDomain}
        ownerAddress={ownerAddress}
        onMessageSent={() => {
          revalidator.revalidate();
        }}
      />
    </>
  );
}
