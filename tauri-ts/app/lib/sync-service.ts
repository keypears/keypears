import type { FixedBuf } from "@keypears/lib";
import { createClientFromDomain } from "@keypears/api-server/client";
import { syncVault } from "./sync";
import { getSession, isSessionExpiringSoon } from "./vault-store";

/**
 * Background sync service that runs independently of React rendering.
 * Supports multiple vaults syncing simultaneously.
 * Each vault polls its server every 5 seconds and syncs data to local SQLite database.
 */

interface VaultSyncConfig {
  vaultId: string;
  vaultDomain: string;
  vaultKey: FixedBuf<32>;
  onSyncComplete?: () => void;
}

interface VaultSyncState {
  config: VaultSyncConfig;
  intervalId: number;
  consecutiveServerErrors: number;
  lastErrorStatus: number | null;
  lastErrorMessage: string | null;
}

// Sync state management - Maps keyed by vaultId
const vaultSyncStates: Map<string, VaultSyncState> = new Map();

// Constants for sync intervals
const NORMAL_SYNC_INTERVAL = 5000; // 5 seconds
const MAX_BACKOFF_INTERVAL = 20000; // 20 seconds

/**
 * Start background sync polling for a vault.
 * Multiple vaults can sync simultaneously.
 *
 * @param onSyncComplete - Optional callback called after each successful sync
 */
export function startBackgroundSync(
  vaultId: string,
  vaultDomain: string,
  vaultKey: FixedBuf<32>,
  onSyncComplete?: () => void,
): void {
  // Stop any existing sync for this vault
  stopBackgroundSync(vaultId);

  const config: VaultSyncConfig = {
    vaultId,
    vaultDomain,
    vaultKey,
    onSyncComplete,
  };

  // Start polling every 5 seconds
  const intervalId = window.setInterval(() => {
    performSync(vaultId);
  }, NORMAL_SYNC_INTERVAL);

  // Store sync state
  vaultSyncStates.set(vaultId, {
    config,
    intervalId,
    consecutiveServerErrors: 0,
    lastErrorStatus: null,
    lastErrorMessage: null,
  });

  // Perform initial sync immediately
  performSync(vaultId);
}

/**
 * Stop background sync polling for a specific vault.
 */
export function stopBackgroundSync(vaultId: string): void {
  const state = vaultSyncStates.get(vaultId);
  if (state) {
    clearInterval(state.intervalId);
    vaultSyncStates.delete(vaultId);
  }
}

/**
 * Stop background sync polling for all vaults.
 */
export function stopAllBackgroundSync(): void {
  for (const [vaultId] of vaultSyncStates) {
    stopBackgroundSync(vaultId);
  }
}

/**
 * Check if a vault is currently syncing.
 */
export function isVaultSyncing(vaultId: string): boolean {
  return vaultSyncStates.has(vaultId);
}

/**
 * Trigger an immediate manual sync for a specific vault.
 * Returns a promise that resolves when sync completes.
 */
export async function triggerManualSync(vaultId: string): Promise<void> {
  await performSync(vaultId);
}

/**
 * Calculate backoff delay based on consecutive errors for a vault.
 */
function getBackoffDelay(vaultId: string): number {
  const state = vaultSyncStates.get(vaultId);
  if (!state || state.consecutiveServerErrors === 0) {
    return NORMAL_SYNC_INTERVAL;
  }
  // Exponential backoff: 5s -> 10s -> 20s -> 20s (capped)
  const delay = Math.min(
    NORMAL_SYNC_INTERVAL * Math.pow(2, state.consecutiveServerErrors),
    MAX_BACKOFF_INTERVAL,
  );
  return delay;
}

/**
 * Internal function that performs the actual sync operation for a vault.
 */
async function performSync(vaultId: string): Promise<void> {
  const state = vaultSyncStates.get(vaultId);
  if (!state) {
    return;
  }

  const { config } = state;

  try {
    // Get current session for this vault from vault-store
    const session = getSession(vaultId);
    if (!session) {
      // No session token available, skip sync
      if (state.lastErrorMessage !== "no-session") {
        console.warn(
          `Background sync skipped for vault ${vaultId}: no session token`,
        );
        state.lastErrorMessage = "no-session";
      }
      return;
    }

    // Check if session is expiring soon
    if (isSessionExpiringSoon(vaultId)) {
      if (state.lastErrorMessage !== "session-expiring") {
        console.warn(
          `Background sync skipped for vault ${vaultId}: session expiring soon (expires at ${new Date(
            session.expiresAt,
          ).toISOString()})`,
        );
        state.lastErrorMessage = "session-expiring";
      }
      return;
    }

    // Create authenticated API client
    const authedClient = await createClientFromDomain(config.vaultDomain, {
      sessionToken: session.sessionToken,
    });

    // Sync vault (updates SQLite database)
    await syncVault(config.vaultId, config.vaultKey, authedClient);

    // Sync completed successfully - reset error tracking
    if (state.consecutiveServerErrors > 0 || state.lastErrorStatus !== null) {
      console.log(
        `Background sync recovered successfully for vault ${vaultId}`,
      );
    }
    state.consecutiveServerErrors = 0;
    state.lastErrorStatus = null;
    state.lastErrorMessage = null;

    // Notify listeners that sync completed
    if (config.onSyncComplete) {
      config.onSyncComplete();
    }
  } catch (error) {
    handleSyncError(vaultId, error);
  }
}

/**
 * Handle sync errors with appropriate logging and backoff strategy.
 */
function handleSyncError(vaultId: string, error: unknown): void {
  const state = vaultSyncStates.get(vaultId);
  if (!state) {
    return;
  }

  // Extract error details
  const errorObj = error as {
    status?: number;
    response?: { status?: number };
    message?: string;
  };
  const status = errorObj?.status || errorObj?.response?.status || null;
  const message = errorObj?.message || "Unknown error";

  // Determine error type and handle appropriately
  if (status === 401) {
    // Session invalid/expired - stop syncing this vault
    console.error(
      `Background sync stopped for vault ${vaultId}: Session invalid or expired (401)`,
    );
    stopBackgroundSync(vaultId);
    // Could emit an event here for UI to handle re-authentication
    return;
  }

  if (status !== null && status >= 500 && status <= 599) {
    // Server error - apply exponential backoff
    state.consecutiveServerErrors++;
    const backoffDelay = getBackoffDelay(vaultId);

    if (state.lastErrorStatus !== status) {
      console.error(
        `Background sync server error for vault ${vaultId} (${status}): ${message}. ` +
          `Backing off to ${backoffDelay / 1000}s interval.`,
      );
      state.lastErrorStatus = status;
    }

    // Reschedule with backoff if needed
    if (backoffDelay > NORMAL_SYNC_INTERVAL) {
      clearInterval(state.intervalId);
      state.intervalId = window.setInterval(() => {
        performSync(vaultId);
      }, backoffDelay);
    }
    return;
  }

  if (status !== null && status >= 400 && status < 500) {
    // Client error (not 401) - log but continue with normal interval
    if (state.lastErrorStatus !== status) {
      console.error(
        `Background sync client error for vault ${vaultId} (${status}): ${message}. ` +
          `Continuing with normal sync interval.`,
      );
      state.lastErrorStatus = status;
    }
    return;
  }

  // Network or other error - log but continue
  if (status === null) {
    if (state.lastErrorMessage !== message) {
      console.error(
        `Background sync network error for vault ${vaultId}: ${message}. ` +
          `Will retry at normal interval.`,
      );
      state.lastErrorMessage = message;
    }
  } else {
    // Unknown error with status
    console.error(
      `Background sync error for vault ${vaultId} (${status}): ${message}`,
    );
  }

  // For non-server errors, reset consecutive error count
  if (status === null || status < 500 || status > 599) {
    state.consecutiveServerErrors = 0;

    // Reset to normal interval if we had backoff
    if (getBackoffDelay(vaultId) > NORMAL_SYNC_INTERVAL) {
      clearInterval(state.intervalId);
      state.intervalId = window.setInterval(() => {
        performSync(vaultId);
      }, NORMAL_SYNC_INTERVAL);
    }
  }
}
