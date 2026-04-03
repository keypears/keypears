import { createClientFromDomain } from "@keypears/api-client";
import { syncVault } from "./sync";
import {
  loadStateFromRust,
  getAllUnlockedVaults,
  getSession,
  getSessionToken,
  isSessionExpiringSoon,
  isSessionExpired,
  getUnlockedVault,
  setSession,
  type UnlockedVault,
} from "./vault-store";
import { refreshSyncState } from "../contexts/sync-context";

/**
 * Unified background sync service.
 *
 * A single polling service that:
 * - Always runs (started on app init)
 * - Loads state from Rust on each tick
 * - Processes all unlocked vaults in batches
 * - Auto-refreshes sessions when expired
 */

// Constants
const POLL_INTERVAL = 500; // 500ms for near-realtime messaging
const BATCH_SIZE = 10; // Process 10 vaults per tick

// Polling state
let pollIntervalId: number | null = null;

// Track errors per vault to avoid log spam
const lastErrorMessages: Map<string, string> = new Map();

/**
 * Start the unified polling service.
 * Should be called once on app initialization.
 * Idempotent - safe to call multiple times.
 */
export function startPollingService(): void {
  if (pollIntervalId !== null) {
    return; // Already running
  }

  pollIntervalId = window.setInterval(() => {
    pollTick().catch((error) => {
      console.error("Poll tick error:", error);
    });
  }, POLL_INTERVAL);

  // Perform initial tick immediately
  pollTick().catch((error) => {
    console.error("Initial poll tick error:", error);
  });
}

/**
 * Stop the polling service.
 * Generally not needed - service runs for app lifetime.
 */
export function stopPollingService(): void {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

/**
 * Check if the polling service is running.
 */
export function isPollingServiceRunning(): boolean {
  return pollIntervalId !== null;
}

/**
 * Single poll tick - runs every POLL_INTERVAL ms.
 */
async function pollTick(): Promise<void> {
  // 1. Load fresh state from Rust
  await loadStateFromRust();

  // 2. Get all unlocked vaults
  const vaults = getAllUnlockedVaults();
  if (vaults.length === 0) {
    return; // Nothing to sync
  }

  // 3. Process in batches - use allSettled so one failure doesn't stop others
  for (let i = 0; i < vaults.length; i += BATCH_SIZE) {
    const batch = vaults.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map((vault) => syncVaultIfNeeded(vault)));
    // allSettled never rejects - every vault in batch is attempted
    // Individual failures are logged inside syncVaultIfNeeded
  }
}

/**
 * Sync a single vault if it has a valid session.
 * Handles session refresh automatically.
 */
async function syncVaultIfNeeded(vault: UnlockedVault): Promise<void> {
  const vaultId = vault.vaultId;

  try {
    const session = getSession(vaultId);

    // No session or session expired - try to refresh
    if (!session || isSessionExpired(session)) {
      const refreshed = await refreshSessionForVault(vaultId);
      if (!refreshed) {
        logOnce(vaultId, "no-session", "No valid session, skipping sync");
        return; // Can't sync without session
      }
    }

    // Session expiring soon - proactively refresh
    if (isSessionExpiringSoon(vaultId)) {
      await refreshSessionForVault(vaultId);
    }

    // Get session token (may have been refreshed)
    const sessionToken = getSessionToken(vaultId);
    if (!sessionToken) {
      logOnce(vaultId, "no-token", "No session token after refresh, skipping");
      return;
    }

    // Sync the vault
    const client = await createClientFromDomain(vault.vaultDomain, {
      sessionToken,
    });
    await syncVault(vaultId, vault.vaultKey, client);

    // Refresh UI state (unread counts)
    await refreshSyncState(vaultId);

    // Clear any previous error state for this vault
    lastErrorMessages.delete(vaultId);
  } catch (error) {
    await handleSyncError(vaultId, error);
  }
}

/**
 * Refresh session for a vault using stored loginKey.
 * No password re-entry needed.
 */
async function refreshSessionForVault(vaultId: string): Promise<boolean> {
  const vault = getUnlockedVault(vaultId);
  if (!vault) {
    return false;
  }

  try {
    const client = await createClientFromDomain(vault.vaultDomain);
    const response = await client.api.login({
      vaultId,
      loginKey: vault.loginKey.buf.toHex(),
      deviceId: vault.deviceId,
      clientDeviceDescription: vault.deviceDescription ?? undefined,
    });

    await setSession(vaultId, response.sessionToken, response.expiresAt);
    console.log(`Session refreshed for vault ${vaultId}`);
    return true;
  } catch (error) {
    console.error(`Session refresh failed for vault ${vaultId}:`, error);
    return false;
  }
}

/**
 * Handle sync errors with appropriate logging.
 * Attempts session refresh on 401.
 */
async function handleSyncError(
  vaultId: string,
  error: unknown,
): Promise<void> {
  const errorObj = error as {
    status?: number;
    response?: { status?: number };
    message?: string;
  };
  const status = errorObj?.status || errorObj?.response?.status || null;
  const message = errorObj?.message || "Unknown error";

  // 401 - Session invalid, try to refresh
  if (status === 401) {
    logOnce(vaultId, "401", "Session expired, attempting refresh");
    const refreshed = await refreshSessionForVault(vaultId);
    if (!refreshed) {
      logOnce(
        vaultId,
        "401-failed",
        "Session refresh failed after 401, will retry next tick",
      );
    }
    return;
  }

  // Server errors (5xx)
  if (status !== null && status >= 500 && status <= 599) {
    logOnce(vaultId, `server-${status}`, `Server error (${status}): ${message}`);
    return;
  }

  // Client errors (4xx, not 401)
  if (status !== null && status >= 400 && status < 500) {
    logOnce(vaultId, `client-${status}`, `Client error (${status}): ${message}`);
    return;
  }

  // Network or other error
  logOnce(vaultId, "network", `Sync error: ${message}`);
}

/**
 * Log a message only if it's different from the last one for this vault.
 * Prevents log spam when the same error occurs repeatedly.
 */
function logOnce(vaultId: string, errorKey: string, message: string): void {
  const key = `${vaultId}:${errorKey}`;
  if (lastErrorMessages.get(vaultId) !== key) {
    console.warn(`[Sync ${vaultId}] ${message}`);
    lastErrorMessages.set(vaultId, key);
  }
}

// ============================================================================
// Legacy API (for backward compatibility during migration)
// ============================================================================

/**
 * @deprecated Use startPollingService() instead.
 * The unified polling service handles all vaults automatically.
 */
export function startBackgroundSync(
  _vaultId: string,
  _vaultDomain: string,
  _vaultKey: unknown,
  _onSyncComplete?: () => void,
): void {
  // No-op: unified polling service handles all vaults
  // Just ensure the polling service is running
  startPollingService();
}

/**
 * @deprecated No longer needed with unified polling service.
 */
export function stopBackgroundSync(_vaultId: string): void {
  // No-op: unified polling service handles all vaults
}

/**
 * @deprecated No longer needed with unified polling service.
 */
export function stopAllBackgroundSync(): void {
  // No-op: use stopPollingService() if needed
}

/**
 * @deprecated Use isPollingServiceRunning() instead.
 */
export function isVaultSyncing(_vaultId: string): boolean {
  return isPollingServiceRunning();
}

/**
 * Trigger an immediate manual sync for a specific vault.
 */
export async function triggerManualSync(vaultId: string): Promise<void> {
  const vault = getUnlockedVault(vaultId);
  if (vault) {
    await syncVaultIfNeeded(vault);
  }
}
