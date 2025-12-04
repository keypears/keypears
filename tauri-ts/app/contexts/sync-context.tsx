import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getUnreadCount } from "~app/db/models/password";

// Module-level state for tracking current vault and providing stable functions
let currentVaultId: string | null = null;
let currentUnreadCount = 0;
let setUnreadCountFn: ((count: number) => void) | null = null;

/**
 * Set the current vault ID for sync state tracking.
 * Called by VaultContext when a vault is unlocked/locked.
 */
export function setCurrentVaultId(vaultId: string | null): void {
  currentVaultId = vaultId;
  if (vaultId === null) {
    currentUnreadCount = 0;
  }
}

/**
 * Refresh sync state from database.
 * Only updates React state if unreadCount actually changed.
 * This is a stable function that doesn't cause re-renders when called.
 */
export async function refreshSyncState(): Promise<void> {
  if (!currentVaultId) {
    return;
  }

  const count = await getUnreadCount(currentVaultId);

  // Only update React state if the count actually changed
  if (count !== currentUnreadCount) {
    currentUnreadCount = count;
    if (setUnreadCountFn) {
      setUnreadCountFn(count);
    }
  }
}

/**
 * Clear sync state (called when vault is locked).
 */
export function clearSyncState(): void {
  currentVaultId = null;
  currentUnreadCount = 0;
  if (setUnreadCountFn) {
    setUnreadCountFn(0);
  }
}

// Context only holds unreadCount for components that need to re-render
interface SyncContextType {
  unreadCount: number;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  // Register the setState function so module-level functions can update React state
  useEffect(() => {
    setUnreadCountFn = setUnreadCount;
    return () => {
      setUnreadCountFn = null;
    };
  }, []);

  return (
    <SyncContext.Provider value={{ unreadCount }}>
      {children}
    </SyncContext.Provider>
  );
}

/**
 * Hook to subscribe to unreadCount changes.
 * ONLY use this in components that need to re-render when unreadCount changes (e.g., UserMenu).
 * Do NOT use this in pages/forms that shouldn't re-render on sync.
 */
export function useSyncState(): SyncContextType {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error("useSyncState must be used within a SyncProvider");
  }
  return context;
}
