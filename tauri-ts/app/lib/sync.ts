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
import { getVault } from "../db/models/vault";
import { deriveEngagementPrivKeyByPubKey } from "./engagement-key-utils";
import { decryptMessage } from "./message-encryption";

export interface SyncResult {
  success: boolean;
  error?: string;
  updatesReceived?: number;
  messagesSynced?: number;
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

    // Sync inbox messages from saved channels to vault
    let messagesSynced = 0;
    try {
      // Get vault domain from local storage
      const vault = await getVault(vaultId);
      if (vault) {
        messagesSynced = await syncInboxMessages(
          vaultId,
          vault.domain,
          vaultKey,
          apiClient,
        );
      }
    } catch (inboxError) {
      // Log error but don't fail the entire sync
      console.error("Failed to sync inbox messages:", inboxError);
    }

    // Clear any previous error
    await clearSyncError(vaultId);

    return {
      success: true,
      updatesReceived: totalUpdatesReceived,
      messagesSynced,
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
 * @param secretId - The secret ID (client-generated UUIDv7 for grouping updates)
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

  // Also save to local SQLite so it appears immediately in the UI
  await insertSecretUpdatesFromSync(
    [
      {
        id: response.id,
        vaultId,
        secretId,
        globalOrder: response.globalOrder,
        localOrder: response.localOrder,
        name: secretData.name,
        type: secretData.type,
        deleted: secretData.deleted ?? false,
        encryptedBlob,
        createdAt: response.createdAt.getTime(),
      },
    ],
    true, // isRead = true since user just created it
  );

  return {
    id: response.id,
    globalOrder: response.globalOrder,
    localOrder: response.localOrder,
    createdAt: response.createdAt,
  };
}

/**
 * Sync inbox messages from saved channels to vault
 *
 * For each inbox message in a "saved" channel:
 * 1. Derive engagement private key from recipientEngagementPubKey
 * 2. Decrypt message content with DH shared secret
 * 3. Re-encrypt with vault key as secret_update
 * 4. Push to server
 * 5. Delete from inbox
 *
 * @param vaultId - The vault to sync messages for
 * @param vaultDomain - The vault's domain (e.g., "keypears.com")
 * @param vaultKey - The vault key for re-encryption
 * @param apiClient - The orpc API client
 * @returns Number of messages synced
 */
export async function syncInboxMessages(
  vaultId: string,
  vaultDomain: string,
  vaultKey: FixedBuf<32>,
  apiClient: KeypearsClient,
): Promise<number> {
  // Get inbox messages for saved channels
  const response = await apiClient.api.getInboxMessagesForSync({
    vaultId,
    limit: 100,
  });

  if (response.messages.length === 0) {
    return 0;
  }

  const syncedMessageIds: string[] = [];

  for (const msg of response.messages) {
    try {
      // 1. Derive my engagement private key from the recipient pubkey
      const myPrivKey = await deriveEngagementPrivKeyByPubKey(
        vaultId,
        vaultDomain,
        msg.recipientEngagementPubKey,
      );

      // 2. Decrypt message content with DH shared secret
      const senderPubKey = FixedBuf.fromHex(33, msg.senderEngagementPubKey);
      const content = decryptMessage(msg.encryptedContent, myPrivKey, senderPubKey);

      // 3. Create secret blob for vault storage
      const messageSecretData: SecretBlobData = {
        name: `Message from ${msg.senderAddress}`,
        type: "message",
        deleted: false,
        messageData: {
          direction: "received",
          counterpartyAddress: msg.counterpartyAddress,
          myEngagementPubKey: msg.recipientEngagementPubKey,
          theirEngagementPubKey: msg.senderEngagementPubKey,
          content,
          timestamp: msg.createdAt.getTime(),
        },
      };

      // 4. Push to server as secret_update (uses channel's secretId)
      await pushSecretUpdate(
        vaultId,
        msg.channelSecretId,
        messageSecretData,
        vaultKey,
        apiClient,
      );

      // Track successfully synced message
      syncedMessageIds.push(msg.id);
    } catch (err) {
      // Log error but continue with other messages
      console.error(`Failed to sync inbox message ${msg.id}:`, err);
    }
  }

  // 5. Delete synced messages from inbox
  if (syncedMessageIds.length > 0) {
    try {
      await apiClient.api.deleteInboxMessages({
        vaultId,
        messageIds: syncedMessageIds,
      });
    } catch (err) {
      // Log error but don't fail the sync - messages will be re-synced next time
      console.error("Failed to delete synced inbox messages:", err);
    }
  }

  return syncedMessageIds.length;
}
