import type { Route } from "./+types/vault.$vaultId.sync";
import { useState, useEffect, useRef } from "react";
import { Link, href, useRevalidator } from "react-router";
import { useUnreadCount, refreshSyncState } from "~app/contexts/sync-context";
import {
  ChevronLeft,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCheck,
} from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import {
  getAllSecretUpdates,
  getTotalSecretUpdateCount,
  getUnreadCount,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  type SecretUpdateRow,
} from "~app/db/models/password";
import {
  getVaultSyncState,
  type VaultSyncState,
} from "~app/db/models/vault-sync-state";
import { triggerManualSync } from "~app/lib/sync-service";

const PAGE_SIZE = 20;

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

function SyncStatusIndicator({
  syncState,
}: {
  syncState: VaultSyncState | null;
}) {
  if (!syncState) {
    return (
      <div className="text-muted-foreground flex items-center gap-2">
        <RefreshCw size={16} className="animate-spin" />
        <span>Initializing...</span>
      </div>
    );
  }

  const lastSync = syncState.lastSyncSuccess;
  const hasError = syncState.syncError !== null;
  const isRecent = lastSync && Date.now() - lastSync < 60000; // Less than 1 minute

  if (hasError) {
    return (
      <div className="text-destructive flex items-center gap-2">
        <AlertCircle size={16} />
        <span>Sync error: {syncState.syncError}</span>
      </div>
    );
  }

  if (isRecent) {
    return (
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <CheckCircle size={16} />
        <span>Synced {formatRelativeTime(lastSync)}</span>
      </div>
    );
  }

  return (
    <div className="text-muted-foreground flex items-center gap-2">
      <RefreshCw size={16} />
      <span>
        Last synced {lastSync ? formatRelativeTime(lastSync) : "never"}
      </span>
    </div>
  );
}

function ActivityItem({
  update,
  onMarkRead,
  onMarkUnread,
}: {
  update: SecretUpdateRow;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
}) {
  const actionText = update.deleted
    ? "deleted"
    : update.localOrder === 1
      ? "created"
      : "updated";

  return (
    <div
      className={`border-border flex items-center justify-between border-b p-4 last:border-b-0 ${
        !update.isRead ? "bg-muted/50" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {!update.isRead && (
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
          )}
          <span className="truncate font-medium">{update.name}</span>
          <span className="text-muted-foreground text-sm">{actionText}</span>
        </div>
        <div className="text-muted-foreground mt-1 text-sm">
          {formatRelativeTime(update.createdAt)}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          update.isRead ? onMarkUnread(update.id) : onMarkRead(update.id)
        }
        title={update.isRead ? "Mark as unread" : "Mark as read"}
      >
        {update.isRead ? <EyeOff size={16} /> : <Eye size={16} />}
      </Button>
    </div>
  );
}

export async function clientLoader({
  params,
  request,
}: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "0", 10);

  const [syncState, updates, totalCount, unreadCount] = await Promise.all([
    getVaultSyncState(vaultId),
    getAllSecretUpdates(vaultId, PAGE_SIZE, page * PAGE_SIZE),
    getTotalSecretUpdateCount(vaultId),
    getUnreadCount(vaultId),
  ]);

  return {
    vaultId,
    syncState: syncState ?? null,
    updates,
    totalCount,
    unreadCount,
    page,
  };
}

export default function VaultSyncActivity({
  loaderData,
}: Route.ComponentProps) {
  const { vaultId, syncState, updates, totalCount, unreadCount, page } =
    loaderData;
  const revalidator = useRevalidator();
  const globalUnreadCount = useUnreadCount(vaultId);
  const prevUnreadCount = useRef(globalUnreadCount);

  const [isSyncing, setIsSyncing] = useState(false);

  // Revalidate when new notifications arrive (detected via global sync state)
  useEffect(() => {
    if (globalUnreadCount > prevUnreadCount.current) {
      revalidator.revalidate();
    }
    prevUnreadCount.current = globalUnreadCount;
  }, [globalUnreadCount, revalidator]);

  const handleMarkRead = async (id: string) => {
    await markAsRead(id);
    await refreshSyncState(vaultId);
    revalidator.revalidate();
  };

  const handleMarkUnread = async (id: string) => {
    await markAsUnread(id);
    await refreshSyncState(vaultId);
    revalidator.revalidate();
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead(vaultId);
    await refreshSyncState(vaultId);
    revalidator.revalidate();
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    const minDuration = 1000; // 1 second minimum for visible feedback
    const startTime = Date.now();

    try {
      await triggerManualSync(vaultId);
      revalidator.revalidate();
    } finally {
      const elapsed = Date.now() - startTime;
      if (elapsed < minDuration) {
        await new Promise((resolve) =>
          setTimeout(resolve, minDuration - elapsed),
        );
      }
      setIsSyncing(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  return (
    <div className="bg-background min-h-screen">
      <Navbar vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header with back button */}
        <div className="mb-6">
          <Link
            to={href("/vault/:vaultId/secrets", { vaultId })}
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
          >
            <ChevronLeft size={16} />
            Back to Passwords
          </Link>
          <h1 className="text-2xl font-bold">Sync Activity</h1>
        </div>

        {/* Sync status card */}
        <div className="border-border bg-card mb-6 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <SyncStatusIndicator syncState={syncState} />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncNow}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <RefreshCw size={16} className="mr-2 animate-spin" />
              ) : (
                <RefreshCw size={16} className="mr-2" />
              )}
              Sync Now
            </Button>
          </div>
        </div>

        {/* Mark all read button */}
        {unreadCount > 0 && (
          <div className="mb-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck size={16} className="mr-2" />
              Mark All Read ({unreadCount})
            </Button>
          </div>
        )}

        {/* Activity list */}
        <div className="border-border bg-card overflow-hidden rounded-lg border">
          {updates.length === 0 ? (
            <div className="text-muted-foreground p-8 text-center">
              No sync activity yet
            </div>
          ) : (
            <>
              {updates.map((update) => (
                <ActivityItem
                  key={update.id}
                  update={update}
                  onMarkRead={handleMarkRead}
                  onMarkUnread={handleMarkUnread}
                />
              ))}
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="sm" asChild disabled={!hasPrevPage}>
              <Link to={`?page=${page - 1}`}>Previous</Link>
            </Button>
            <span className="text-muted-foreground text-sm">
              Page {page + 1} of {totalPages}
            </span>
            <Button variant="outline" size="sm" asChild disabled={!hasNextPage}>
              <Link to={`?page=${page + 1}`}>Next</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
