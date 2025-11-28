import { db } from "../index";
import { TableSecretUpdate } from "../schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * Secret update row as stored in local database
 * Matches the new schema with order numbers and encrypted blob
 */
export interface SecretUpdateRow {
  id: string;
  vaultId: string;
  secretId: string;
  globalOrder: number;
  localOrder: number;
  name: string;
  type: "password" | "envvar" | "apikey" | "walletkey" | "passkey";
  deleted: boolean;
  encryptedBlob: string;
  createdAt: number;
}

/**
 * Insert secret updates from server sync
 * Called by sync.ts after fetching and decrypting updates from server
 *
 * Uses upsert logic: if update with same ID exists, replace it.
 * This handles the case where we re-sync the same updates.
 *
 * @param updates - Array of updates to insert
 */
export async function insertSecretUpdatesFromSync(
  updates: Array<{
    id: string;
    vaultId: string;
    secretId: string;
    globalOrder: number;
    localOrder: number;
    name: string;
    type: string;
    deleted: boolean;
    encryptedBlob: string;
    createdAt: number;
  }>,
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  // Insert all updates
  // SQLite will handle conflicts if we try to insert duplicate IDs
  for (const update of updates) {
    await db
      .insert(TableSecretUpdate)
      .values({
        id: update.id,
        vaultId: update.vaultId,
        secretId: update.secretId,
        globalOrder: update.globalOrder,
        localOrder: update.localOrder,
        name: update.name,
        type: update.type,
        deleted: update.deleted,
        encryptedBlob: update.encryptedBlob,
        createdAt: update.createdAt,
      })
      .onConflictDoUpdate({
        target: TableSecretUpdate.id,
        set: {
          name: update.name,
          type: update.type,
          deleted: update.deleted,
          encryptedBlob: update.encryptedBlob,
        },
      });
  }
}

/**
 * Get latest version of a secret (highest localOrder)
 *
 * @param secretId - The secret ID to get
 * @returns Latest secret update or undefined if not found
 */
export async function getLatestSecret(
  secretId: string,
): Promise<SecretUpdateRow | undefined> {
  const results = await db
    .select()
    .from(TableSecretUpdate)
    .where(eq(TableSecretUpdate.secretId, secretId))
    .orderBy(desc(TableSecretUpdate.localOrder))
    .limit(1);

  return results[0];
}

/**
 * Get all current secrets for a vault (non-deleted, latest versions only)
 *
 * Uses a subquery to find the maximum localOrder for each secretId,
 * then joins to get the full records for those max versions.
 * Filters out deleted secrets.
 *
 * @param vaultId - The vault ID to get secrets for
 * @returns Array of current (latest, non-deleted) secrets
 */
export async function getAllCurrentSecrets(
  vaultId: string,
): Promise<SecretUpdateRow[]> {
  // Subquery to get the maximum localOrder for each secretId in this vault
  const latestUpdates = db
    .select({
      secretId: TableSecretUpdate.secretId,
      maxLocalOrder: sql<number>`MAX(${TableSecretUpdate.localOrder})`.as(
        "max_local_order",
      ),
    })
    .from(TableSecretUpdate)
    .where(eq(TableSecretUpdate.vaultId, vaultId))
    .groupBy(TableSecretUpdate.secretId)
    .as("latest_updates");

  // Join with the main table to get the full records
  const results = await db
    .select({
      id: TableSecretUpdate.id,
      vaultId: TableSecretUpdate.vaultId,
      secretId: TableSecretUpdate.secretId,
      globalOrder: TableSecretUpdate.globalOrder,
      localOrder: TableSecretUpdate.localOrder,
      name: TableSecretUpdate.name,
      type: TableSecretUpdate.type,
      deleted: TableSecretUpdate.deleted,
      encryptedBlob: TableSecretUpdate.encryptedBlob,
      createdAt: TableSecretUpdate.createdAt,
    })
    .from(TableSecretUpdate)
    .innerJoin(
      latestUpdates,
      and(
        eq(TableSecretUpdate.secretId, latestUpdates.secretId),
        eq(TableSecretUpdate.localOrder, latestUpdates.maxLocalOrder),
      ),
    )
    .where(
      and(
        eq(TableSecretUpdate.vaultId, vaultId),
        eq(TableSecretUpdate.deleted, false), // Filter out deleted secrets
      ),
    )
    .orderBy(TableSecretUpdate.name);

  return results;
}

/**
 * Get full history for a secret (all updates ordered by localOrder)
 *
 * @param secretId - The secret ID to get history for
 * @returns Array of all updates for this secret, ordered chronologically
 */
export async function getSecretHistory(
  secretId: string,
): Promise<SecretUpdateRow[]> {
  const results = await db
    .select()
    .from(TableSecretUpdate)
    .where(eq(TableSecretUpdate.secretId, secretId))
    .orderBy(TableSecretUpdate.localOrder); // ASC for chronological order

  return results;
}
