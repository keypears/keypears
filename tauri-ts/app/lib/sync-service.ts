import type { FixedBuf } from "@keypears/lib";
import { createApiClient } from "./api-client";
import { syncVault } from "./sync";

/**
 * Background sync service that runs independently of React rendering.
 * Polls server every 5 seconds and syncs vault data to local SQLite database.
 */

interface SessionInfo {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

interface VaultConfig {
  vaultId: string;
  vaultDomain: string;
  vaultKey: FixedBuf<32>;
  getSession: () => SessionInfo | null;
  onSyncComplete?: () => void;
}

// Sync state management
let syncIntervalId: number | null = null;
let currentVaultConfig: VaultConfig | null = null;

// Error tracking for exponential backoff
let consecutiveServerErrors = 0;
let lastErrorStatus: number | null = null;
let lastErrorMessage: string | null = null;

// Constants for sync intervals
const NORMAL_SYNC_INTERVAL = 5000; // 5 seconds
const MAX_BACKOFF_INTERVAL = 20000; // 20 seconds
const SESSION_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes

/**
 * Start background sync polling for a vault.
 * Only one vault can be synced at a time.
 *
 * @param onSyncComplete - Optional callback called after each successful sync
 */
export function startBackgroundSync(
  vaultId: string,
  vaultDomain: string,
  vaultKey: FixedBuf<32>,
  getSession: () => SessionInfo | null,
  onSyncComplete?: () => void,
): void {
  // Stop any existing sync
  stopBackgroundSync();

  // Store vault config
  currentVaultConfig = {
    vaultId,
    vaultDomain,
    vaultKey,
    getSession,
    onSyncComplete,
  };

  // Reset error tracking
  consecutiveServerErrors = 0;
  lastErrorStatus = null;
  lastErrorMessage = null;

  // Start polling every 5 seconds
  syncIntervalId = window.setInterval(() => {
    performSync();
  }, NORMAL_SYNC_INTERVAL);

  // Perform initial sync immediately
  performSync();
}

/**
 * Stop background sync polling.
 */
export function stopBackgroundSync(): void {
  if (syncIntervalId !== null) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  currentVaultConfig = null;
  consecutiveServerErrors = 0;
  lastErrorStatus = null;
  lastErrorMessage = null;
}

/**
 * Trigger an immediate manual sync (used after creating/editing secrets).
 * Returns a promise that resolves when sync completes.
 */
export async function triggerManualSync(): Promise<void> {
  await performSync();
}

/**
 * Calculate backoff delay based on consecutive errors
 */
function getBackoffDelay(): number {
  if (consecutiveServerErrors === 0) {
    return NORMAL_SYNC_INTERVAL;
  }
  // Exponential backoff: 5s -> 10s -> 20s -> 20s (capped)
  const delay = Math.min(
    NORMAL_SYNC_INTERVAL * Math.pow(2, consecutiveServerErrors),
    MAX_BACKOFF_INTERVAL
  );
  return delay;
}

/**
 * Internal function that performs the actual sync operation.
 */
async function performSync(): Promise<void> {
  if (!currentVaultConfig) {
    return;
  }

  try {
    // Get current session
    const session = currentVaultConfig.getSession();
    if (!session) {
      // No session token available, skip sync
      if (lastErrorMessage !== "no-session") {
        console.warn("Background sync skipped: no session token");
        lastErrorMessage = "no-session";
      }
      return;
    }

    // Check if session is expiring soon
    const now = Date.now();
    if (session.expiresAt < now + SESSION_EXPIRY_BUFFER) {
      if (lastErrorMessage !== "session-expiring") {
        console.warn(
          `Background sync skipped: session expiring soon (expires at ${new Date(
            session.expiresAt
          ).toISOString()})`
        );
        lastErrorMessage = "session-expiring";
      }
      return;
    }

    // Create authenticated API client
    const authedClient = await createApiClient(
      currentVaultConfig.vaultDomain,
      session.token,
    );

    // Sync vault (updates SQLite database)
    await syncVault(
      currentVaultConfig.vaultId,
      currentVaultConfig.vaultKey,
      authedClient,
    );

    // Sync completed successfully - reset error tracking
    if (consecutiveServerErrors > 0 || lastErrorStatus !== null) {
      console.log("Background sync recovered successfully");
    }
    consecutiveServerErrors = 0;
    lastErrorStatus = null;
    lastErrorMessage = null;

    // Notify listeners that sync completed
    if (currentVaultConfig?.onSyncComplete) {
      currentVaultConfig.onSyncComplete();
    }

  } catch (error) {
    handleSyncError(error);
  }
}

/**
 * Handle sync errors with appropriate logging and backoff strategy
 */
function handleSyncError(error: any): void {
  // Extract error details
  const status = error?.status || error?.response?.status || null;
  const message = error?.message || "Unknown error";

  // Determine error type and handle appropriately
  if (status === 401) {
    // Session invalid/expired - stop syncing
    console.error("Background sync stopped: Session invalid or expired (401)");
    stopBackgroundSync();
    // Could emit an event here for UI to handle re-authentication
    return;
  }

  if (status >= 500 && status <= 599) {
    // Server error - apply exponential backoff
    consecutiveServerErrors++;
    const backoffDelay = getBackoffDelay();

    if (lastErrorStatus !== status) {
      console.error(
        `Background sync server error (${status}): ${message}. ` +
        `Backing off to ${backoffDelay / 1000}s interval.`
      );
      lastErrorStatus = status;
    }

    // Reschedule with backoff if needed
    if (backoffDelay > NORMAL_SYNC_INTERVAL && syncIntervalId !== null) {
      clearInterval(syncIntervalId);
      syncIntervalId = window.setInterval(() => {
        performSync();
      }, backoffDelay);
    }
    return;
  }

  if (status >= 400 && status < 500) {
    // Client error (not 401) - log but continue with normal interval
    if (lastErrorStatus !== status) {
      console.error(
        `Background sync client error (${status}): ${message}. ` +
        `Continuing with normal sync interval.`
      );
      lastErrorStatus = status;
    }
    return;
  }

  // Network or other error - log but continue
  if (!status) {
    if (lastErrorMessage !== message) {
      console.error(
        `Background sync network error: ${message}. ` +
        `Will retry at normal interval.`
      );
      lastErrorMessage = message;
    }
  } else {
    // Unknown error with status
    console.error(`Background sync error (${status}): ${message}`);
  }

  // For non-server errors, reset consecutive error count
  if (status < 500 || status > 599) {
    consecutiveServerErrors = 0;

    // Reset to normal interval if we had backoff
    if (syncIntervalId !== null && getBackoffDelay() > NORMAL_SYNC_INTERVAL) {
      clearInterval(syncIntervalId);
      syncIntervalId = window.setInterval(() => {
        performSync();
      }, NORMAL_SYNC_INTERVAL);
    }
  }
}