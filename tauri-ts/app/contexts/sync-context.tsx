import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { getUnreadCount as getUnreadCountFromDb } from "~app/db/models/password";

/**
 * Sync Context for Multi-Vault Support
 *
 * Tracks unread notification counts per vault.
 * Components can subscribe to updates for specific vaults.
 */

// Module-level state for tracking unread counts per vault
const unreadCounts: Map<string, number> = new Map();
let setUnreadCountsFn: ((counts: Map<string, number>) => void) | null = null;

/**
 * Refresh sync state for a specific vault from database.
 * Only updates React state if unreadCount actually changed.
 */
export async function refreshSyncState(vaultId: string): Promise<void> {
  const count = await getUnreadCountFromDb(vaultId);
  const currentCount = unreadCounts.get(vaultId) ?? 0;

  // Only update React state if the count actually changed
  if (count !== currentCount) {
    unreadCounts.set(vaultId, count);
    if (setUnreadCountsFn) {
      // Create a new Map to trigger React re-render
      setUnreadCountsFn(new Map(unreadCounts));
    }
  }
}

/**
 * Clear sync state for a specific vault (called when vault is locked).
 */
export function clearSyncState(vaultId: string): void {
  unreadCounts.delete(vaultId);
  if (setUnreadCountsFn) {
    setUnreadCountsFn(new Map(unreadCounts));
  }
}

/**
 * Clear all sync state (called when all vaults are locked).
 */
export function clearAllSyncState(): void {
  unreadCounts.clear();
  if (setUnreadCountsFn) {
    setUnreadCountsFn(new Map());
  }
}

/**
 * Get unread count for a specific vault (non-reactive, for use outside React).
 */
export function getUnreadCountForVault(vaultId: string): number {
  return unreadCounts.get(vaultId) ?? 0;
}

// Context holds unreadCounts map for components that need to re-render
interface SyncContextType {
  unreadCounts: Map<string, number>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Map<string, number>>(
    () => new Map(unreadCounts),
  );

  // Register the setState function so module-level functions can update React state
  useEffect(() => {
    setUnreadCountsFn = setCounts;
    return () => {
      setUnreadCountsFn = null;
    };
  }, []);

  return (
    <SyncContext.Provider value={{ unreadCounts: counts }}>
      {children}
    </SyncContext.Provider>
  );
}

/**
 * Hook to get unread count for a specific vault.
 * Re-renders when the count changes.
 */
export function useUnreadCount(vaultId: string): number {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error("useUnreadCount must be used within a SyncProvider");
  }
  return context.unreadCounts.get(vaultId) ?? 0;
}

/**
 * Hook to get all unread counts.
 * Re-renders when any count changes.
 */
export function useAllUnreadCounts(): Map<string, number> {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error("useAllUnreadCounts must be used within a SyncProvider");
  }
  return context.unreadCounts;
}

// ============================================================================
// Backward Compatibility (DEPRECATED - to be removed after migration)
// ============================================================================

// For backward compatibility during migration
let currentVaultIdForCompat: string | null = null;

/**
 * @deprecated Use refreshSyncState(vaultId) instead
 * Set the current vault ID for sync state tracking.
 */
export function setCurrentVaultId(vaultId: string | null): void {
  currentVaultIdForCompat = vaultId;
}

/**
 * @deprecated No longer needed - state is tracked per vault
 * Legacy hook for backward compatibility.
 */
export function useSyncState(): { unreadCount: number } {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error("useSyncState must be used within a SyncProvider");
  }
  // Return count for the "current" vault (backward compat)
  const count = currentVaultIdForCompat
    ? (context.unreadCounts.get(currentVaultIdForCompat) ?? 0)
    : 0;
  return { unreadCount: count };
}
