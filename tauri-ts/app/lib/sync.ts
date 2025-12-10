import { FixedBuf } from "@keypears/lib";
import type { KeypearsClient } from "@keypears/api-server/client";
import {
  encryptSecretUpdateBlob,
  decryptSecretUpdateBlob,
} from "./secret-encryption";
import type { SecretBlobData } from "./secret-encryption";
import {
  getVaultSyncState,
  updateLastSyncedOrder,
  recordSyncAttempt,
  recordSyncError,
  clearSyncError,
} from "../db/models/vault-sync-state";
import { insertSecretUpdatesFromSync } from "../db/models/password";

export interface SyncResult {
  success: boolean;
  error?: string;
  updatesReceived?: number;
}

/**
 * Poll server for new updates since lastSyncedGlobalOrder
 * Decrypts each update, stores in local DB
 * Updates VaultSyncState with new lastSyncedGlobalOrder
 *
 * @param vaultId - The vault to sync
 * @param vaultKey - The vault key for decryption
 * @param apiClient - The orpc API client
 * @returns Sync result with success status and optional error
 */
export async function syncVault(
  vaultId: string,
  vaultKey: FixedBuf<32>,
  apiClient: KeypearsClient,
): Promise<SyncResult> {
  try {
    // Record sync attempt
    await recordSyncAttempt(vaultId);

    // Get current sync state
    const syncState = await getVaultSyncState(vaultId);
    if (!syncState) {
      throw new Error(`No sync state found for vault ${vaultId}`);
    }

    const sinceGlobalOrder = syncState.lastSyncedGlobalOrder;
    let totalUpdatesReceived = 0;
    let hasMore = true;
    let currentGlobalOrder = sinceGlobalOrder;

    // Fetch all updates with pagination
    while (hasMore) {
      const response = await apiClient.api.getSecretUpdates({
        vaultId,
        sinceGlobalOrder: currentGlobalOrder,
        limit: 100, // Batch size
      });

      if (response.updates.length === 0) {
        break;
      }

      // Decrypt and prepare updates for local storage
      const localUpdates = response.updates.map(
        (serverUpdate: {
          id: string;
          secretId: string;
          globalOrder: number;
          localOrder: number;
          encryptedBlob: string;
          createdAt: Date;
        }) => {
          // Decrypt the blob to get the secret data
          const blobData = decryptSecretUpdateBlob(
            serverUpdate.encryptedBlob,
            vaultKey,
          );

          // Return update with decrypted name for indexing, but keep encrypted blob
          return {
            id: serverUpdate.id,
            vaultId,
            secretId: serverUpdate.secretId,
            globalOrder: serverUpdate.globalOrder,
            localOrder: serverUpdate.localOrder,
            name: blobData.name, // Decrypted for local indexing
            type: blobData.type,
            deleted: blobData.deleted,
            encryptedBlob: serverUpdate.encryptedBlob, // Keep encrypted
            createdAt: new Date(serverUpdate.createdAt).getTime(), // Convert to Unix ms
          };
        },
      );

      // Insert into local database
      await insertSecretUpdatesFromSync(localUpdates);

      totalUpdatesReceived += localUpdates.length;

      // Update current order to the highest we've seen
      const maxOrder = Math.max(
        ...localUpdates.map((u: { globalOrder: number }) => u.globalOrder),
      );
      currentGlobalOrder = maxOrder;

      // Check if more updates exist
      hasMore = response.hasMore;
    }

    // Update sync state with the latest order from server
    // Use the server's latestGlobalOrder to ensure we're synced to the absolute latest
    await updateLastSyncedOrder(vaultId, currentGlobalOrder);

    // Clear any previous error
    await clearSyncError(vaultId);

    return {
      success: true,
      updatesReceived: totalUpdatesReceived,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown sync error";

    // Record the error in sync state
    await recordSyncError(vaultId, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Create new secret update on server
 * Encrypts blob, sends to server, waits for response
 * Does NOT sync - sync will pick it up on next poll
 *
 * @param vaultId - The vault this secret belongs to
 * @param secretId - The secret ID (client-generated ULID for grouping updates)
 * @param secretData - The secret data to encrypt and send
 * @param vaultKey - The vault key for encryption
 * @param apiClient - The orpc API client
 * @returns Server response with generated ID, order numbers, and timestamp
 */
export async function pushSecretUpdate(
  vaultId: string,
  secretId: string,
  secretData: SecretBlobData,
  vaultKey: FixedBuf<32>,
  apiClient: KeypearsClient,
): Promise<{
  id: string;
  globalOrder: number;
  localOrder: number;
  createdAt: Date;
}> {
  // Encrypt the blob
  const encryptedBlob = encryptSecretUpdateBlob(secretData, vaultKey);

  // Send to server
  const response = await apiClient.api.createSecretUpdate({
    vaultId,
    secretId,
    encryptedBlob,
  });

  return {
    id: response.id,
    globalOrder: response.globalOrder,
    localOrder: response.localOrder,
    createdAt: response.createdAt,
  };
}
