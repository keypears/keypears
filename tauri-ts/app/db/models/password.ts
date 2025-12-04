import { db } from "../index";
import { TableSecretUpdate } from "../schema";
import { eq, and, desc, sql, count } from "drizzle-orm";

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
  isRead: boolean;
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
 * @param isRead - Whether to mark updates as read (true for local creates, false for synced)
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
  isRead: boolean = false,
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
        isRead,
      })
      .onConflictDoUpdate({
        target: TableSecretUpdate.id,
        set: {
          name: update.name,
          type: update.type,
          deleted: update.deleted,
          encryptedBlob: update.encryptedBlob,
          // Don't update isRead on conflict - preserve existing read state
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

  return results[0] as SecretUpdateRow | undefined;
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

  return results as SecretUpdateRow[];
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

  return results as SecretUpdateRow[];
}

/**
 * Get count of unread secret updates for a vault
 *
 * @param vaultId - The vault ID to count unread updates for
 * @returns Number of unread secret updates
 */
export async function getUnreadCount(vaultId: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(TableSecretUpdate)
    .where(
      and(
        eq(TableSecretUpdate.vaultId, vaultId),
        eq(TableSecretUpdate.isRead, false),
      ),
    );

  return result[0]?.count ?? 0;
}

/**
 * Mark a single secret update as read
 *
 * @param id - The update ID to mark as read
 */
export async function markAsRead(id: string): Promise<void> {
  await db
    .update(TableSecretUpdate)
    .set({ isRead: true })
    .where(eq(TableSecretUpdate.id, id));
}

/**
 * Mark a single secret update as unread
 *
 * @param id - The update ID to mark as unread
 */
export async function markAsUnread(id: string): Promise<void> {
  await db
    .update(TableSecretUpdate)
    .set({ isRead: false })
    .where(eq(TableSecretUpdate.id, id));
}

/**
 * Mark all secret updates in a vault as read
 *
 * @param vaultId - The vault ID to mark all updates as read
 */
export async function markAllAsRead(vaultId: string): Promise<void> {
  await db
    .update(TableSecretUpdate)
    .set({ isRead: true })
    .where(eq(TableSecretUpdate.vaultId, vaultId));
}

/**
 * Get all secret updates for a vault with pagination (for activity log)
 * Returns updates ordered by globalOrder descending (newest first)
 *
 * @param vaultId - The vault ID to get updates for
 * @param limit - Number of updates to return (default 50)
 * @param offset - Number of updates to skip (default 0)
 * @returns Array of secret updates ordered by newest first
 */
export async function getAllSecretUpdates(
  vaultId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<SecretUpdateRow[]> {
  const results = await db
    .select()
    .from(TableSecretUpdate)
    .where(eq(TableSecretUpdate.vaultId, vaultId))
    .orderBy(desc(TableSecretUpdate.globalOrder))
    .limit(limit)
    .offset(offset);

  return results as SecretUpdateRow[];
}

/**
 * Get total count of secret updates for a vault (for pagination)
 *
 * @param vaultId - The vault ID to count updates for
 * @returns Total number of secret updates
 */
export async function getTotalSecretUpdateCount(
  vaultId: string,
): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(TableSecretUpdate)
    .where(eq(TableSecretUpdate.vaultId, vaultId));

  return result[0]?.count ?? 0;
}
