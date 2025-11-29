import type { FixedBuf } from "@keypears/lib";
import { createApiClient } from "./api-client";
import { syncVault } from "./sync";

/**
 * Background sync service that runs independently of React rendering.
 * Polls server every 5 seconds and syncs vault data to local SQLite database.
 */

interface VaultConfig {
  vaultId: string;
  vaultDomain: string;
  vaultKey: FixedBuf<32>;
  loginKey: FixedBuf<32>;
}

let syncIntervalId: number | null = null;
let currentVaultConfig: VaultConfig | null = null;

/**
 * Start background sync polling for a vault.
 * Only one vault can be synced at a time.
 */
export function startBackgroundSync(
  vaultId: string,
  vaultDomain: string,
  vaultKey: FixedBuf<32>,
  loginKey: FixedBuf<32>,
): void {
  // Stop any existing sync
  stopBackgroundSync();

  // Store vault config
  currentVaultConfig = {
    vaultId,
    vaultDomain,
    vaultKey,
    loginKey,
  };

  // Start polling every 5 seconds
  syncIntervalId = window.setInterval(() => {
    performSync();
  }, 5000);

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
}

/**
 * Trigger an immediate manual sync (used after creating/editing secrets).
 * Returns a promise that resolves when sync completes.
 */
export async function triggerManualSync(): Promise<void> {
  await performSync();
}

/**
 * Internal function that performs the actual sync operation.
 */
async function performSync(): Promise<void> {
  if (!currentVaultConfig) {
    return;
  }

  try {
    // Create authenticated API client
    const authedClient = createApiClient(
      currentVaultConfig.vaultDomain,
      currentVaultConfig.loginKey,
    );

    // Sync vault (updates SQLite database)
    await syncVault(
      currentVaultConfig.vaultId,
      currentVaultConfig.vaultKey,
      authedClient,
    );

    // Sync completed successfully (silently)
  } catch (error) {
    // Log error but don't throw (background sync should be silent)
    console.error("Background sync error:", error);
  }
}
