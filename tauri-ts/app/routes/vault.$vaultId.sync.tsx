import { useState, useEffect, useCallback } from "react";
import { Link, href } from "react-router";
import { ChevronLeft, CheckCircle, AlertCircle, RefreshCw, Eye, EyeOff, CheckCheck } from "lucide-react";
import { useVault } from "~app/contexts/vault-context";
import { refreshSyncState } from "~app/contexts/sync-context";
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
import { getVaultSyncState, type VaultSyncState } from "~app/db/models/vault-sync-state";
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

function SyncStatusIndicator({ syncState }: { syncState: VaultSyncState | null }) {
  if (!syncState) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <RefreshCw size={16} className="animate-spin" />
        <span>Initializing...</span>
      </div>
    );
  }

  const lastSync = syncState.lastSyncSuccess;
  const hasError = syncState.syncError !== null;
  const isRecent = lastSync && (Date.now() - lastSync) < 60000; // Less than 1 minute

  if (hasError) {
    return (
      <div className="flex items-center gap-2 text-destructive">
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
    <div className="flex items-center gap-2 text-muted-foreground">
      <RefreshCw size={16} />
      <span>Last synced {lastSync ? formatRelativeTime(lastSync) : "never"}</span>
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
      className={`flex items-center justify-between border-b border-border p-4 ${
        !update.isRead ? "bg-muted/50" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {!update.isRead && (
            <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
          )}
          <span className="font-medium truncate">{update.name}</span>
          <span className="text-muted-foreground text-sm">
            {actionText}
          </span>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {formatRelativeTime(update.createdAt)}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => update.isRead ? onMarkUnread(update.id) : onMarkRead(update.id)}
        title={update.isRead ? "Mark as unread" : "Mark as read"}
      >
        {update.isRead ? <EyeOff size={16} /> : <Eye size={16} />}
      </Button>
    </div>
  );
}

export default function VaultSyncActivity() {
  const { activeVault } = useVault();

  // All state is local to this page - no context subscription
  const [syncState, setSyncState] = useState<VaultSyncState | null>(null);
  const [updates, setUpdates] = useState<SecretUpdateRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch all data locally
  const fetchData = useCallback(async () => {
    if (!activeVault) return;

    setIsLoading(true);
    try {
      const [state, activityUpdates, total, unread] = await Promise.all([
        getVaultSyncState(activeVault.vaultId),
        getAllSecretUpdates(activeVault.vaultId, PAGE_SIZE, page * PAGE_SIZE),
        getTotalSecretUpdateCount(activeVault.vaultId),
        getUnreadCount(activeVault.vaultId),
      ]);
      setSyncState(state ?? null);
      setUpdates(activityUpdates);
      setTotalCount(total);
      setUnreadCount(unread);
    } finally {
      setIsLoading(false);
    }
  }, [activeVault, page]);

  // Fetch data on mount and page change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleMarkRead = async (id: string) => {
    if (!activeVault) return;
    await markAsRead(id);
    // Update local UI immediately
    setUpdates((prev) =>
      prev.map((u) => (u.id === id ? { ...u, isRead: true } : u))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    // Refresh global sync state (updates notification in UserMenu)
    await refreshSyncState();
  };

  const handleMarkUnread = async (id: string) => {
    if (!activeVault) return;
    await markAsUnread(id);
    // Update local UI immediately
    setUpdates((prev) =>
      prev.map((u) => (u.id === id ? { ...u, isRead: false } : u))
    );
    setUnreadCount((prev) => prev + 1);
    // Refresh global sync state (updates notification in UserMenu)
    await refreshSyncState();
  };

  const handleMarkAllRead = async () => {
    if (!activeVault) return;
    await markAllAsRead(activeVault.vaultId);
    // Update local UI immediately
    setUpdates((prev) => prev.map((u) => ({ ...u, isRead: true })));
    setUnreadCount(0);
    // Refresh global sync state (updates notification in UserMenu)
    await refreshSyncState();
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    const minDuration = 1000; // 1 second minimum for visible feedback
    const startTime = Date.now();

    try {
      await triggerManualSync();
      // Refresh local data after sync
      await fetchData();
    } finally {
      // Wait for remaining time if sync was faster than minDuration
      const elapsed = Date.now() - startTime;
      if (elapsed < minDuration) {
        await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
      }
      setIsSyncing(false);
    }
  };

  if (!activeVault) {
    return null;
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header with back button */}
        <div className="mb-6">
          <Link
            to={href("/vault/:vaultId/secrets", { vaultId: activeVault.vaultId })}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ChevronLeft size={16} />
            Back to Passwords
          </Link>
          <h1 className="text-2xl font-bold">Sync Activity</h1>
        </div>

        {/* Sync status card */}
        <div className="rounded-lg border border-border bg-card p-4 mb-6">
          <div className="flex items-center justify-between">
            <SyncStatusIndicator syncState={syncState} />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncNow}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <RefreshCw size={16} className="animate-spin mr-2" />
              ) : (
                <RefreshCw size={16} className="mr-2" />
              )}
              Sync Now
            </Button>
          </div>
        </div>

        {/* Mark all read button */}
        {unreadCount > 0 && (
          <div className="flex justify-end mb-4">
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck size={16} className="mr-2" />
              Mark All Read ({unreadCount})
            </Button>
          </div>
        )}

        {/* Activity list */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {isLoading && updates.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading activity...
            </div>
          ) : updates.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
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
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrevPage}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNextPage}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
