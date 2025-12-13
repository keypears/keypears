import { eq, and, gt, max } from "drizzle-orm";
import { generateId } from "@keypears/lib";
import { db } from "../index.js";
import { TableSecretUpdate, type SelectSecretUpdate } from "../schema.js";

/**
 * Secret update model interface
 * Represents a secret update in the append-only log
 */
export interface SecretUpdate {
  id: string;
  vaultId: string;
  secretId: string;
  globalOrder: number;
  localOrder: number;
  encryptedBlob: string;
  createdAt: Date;
}

/**
 * Get the maximum global order number for a vault
 *
 * @param vaultId - The vault ID
 * @returns The maximum global order, or 0 if no updates exist
 */
export async function getMaxGlobalOrder(vaultId: string): Promise<number> {
  const result = await db
    .select({
      maxOrder: max(TableSecretUpdate.globalOrder),
    })
    .from(TableSecretUpdate)
    .where(eq(TableSecretUpdate.vaultId, vaultId));

  return result[0]?.maxOrder ?? 0;
}

/**
 * Get the maximum local order number for a secret
 *
 * @param secretId - The secret ID
 * @returns The maximum local order, or 0 if no updates exist
 */
export async function getMaxLocalOrder(secretId: string): Promise<number> {
  const result = await db
    .select({
      maxOrder: max(TableSecretUpdate.localOrder),
    })
    .from(TableSecretUpdate)
    .where(eq(TableSecretUpdate.secretId, secretId));

  return result[0]?.maxOrder ?? 0;
}

/**
 * Create a new secret update with atomically generated order numbers
 *
 * @param vaultId - The vault ID
 * @param secretId - The secret ID (groups updates for the same secret)
 * @param encryptedBlob - The encrypted secret data
 * @returns The newly created secret update
 */
export async function createSecretUpdate(
  vaultId: string,
  secretId: string,
  encryptedBlob: string,
): Promise<SecretUpdate> {
  const updateId = generateId();

  // Use transaction to atomically get order numbers and insert
  const result = await db.transaction(async (tx) => {
    // Get the current max globalOrder for this vault
    const globalOrderResult = await tx
      .select({
        maxOrder: max(TableSecretUpdate.globalOrder),
      })
      .from(TableSecretUpdate)
      .where(eq(TableSecretUpdate.vaultId, vaultId));

    const nextGlobalOrder = (globalOrderResult[0]?.maxOrder ?? 0) + 1;

    // Get the current max localOrder for this secret
    const localOrderResult = await tx
      .select({
        maxOrder: max(TableSecretUpdate.localOrder),
      })
      .from(TableSecretUpdate)
      .where(eq(TableSecretUpdate.secretId, secretId));

    const nextLocalOrder = (localOrderResult[0]?.maxOrder ?? 0) + 1;

    // Insert the new secret update with generated order numbers
    const inserted = await tx
      .insert(TableSecretUpdate)
      .values({
        id: updateId,
        vaultId,
        secretId,
        globalOrder: nextGlobalOrder,
        localOrder: nextLocalOrder,
        encryptedBlob,
      })
      .returning();

    return inserted[0];
  });

  if (!result) {
    throw new Error("Failed to create secret update");
  }

  return result;
}

/**
 * Get secret updates since a specific global order
 *
 * @param vaultId - The vault ID
 * @param sinceGlobalOrder - Return updates with globalOrder > this value
 * @param limit - Maximum number of updates to return
 * @returns Object containing updates, hasMore flag, and latestGlobalOrder
 */
export async function getSecretUpdatesSince(
  vaultId: string,
  sinceGlobalOrder: number,
  limit: number,
): Promise<{
  updates: SecretUpdate[];
  hasMore: boolean;
  latestGlobalOrder: number;
}> {
  // Get the latest globalOrder for this vault
  const latestGlobalOrder = await getMaxGlobalOrder(vaultId);

  // Fetch updates with globalOrder > sinceGlobalOrder
  // Fetch limit + 1 to determine if more exist
  const updates = await db
    .select({
      id: TableSecretUpdate.id,
      vaultId: TableSecretUpdate.vaultId,
      secretId: TableSecretUpdate.secretId,
      globalOrder: TableSecretUpdate.globalOrder,
      localOrder: TableSecretUpdate.localOrder,
      encryptedBlob: TableSecretUpdate.encryptedBlob,
      createdAt: TableSecretUpdate.createdAt,
    })
    .from(TableSecretUpdate)
    .where(
      and(
        eq(TableSecretUpdate.vaultId, vaultId),
        gt(TableSecretUpdate.globalOrder, sinceGlobalOrder),
      ),
    )
    .orderBy(TableSecretUpdate.globalOrder) // ASC for chronological order
    .limit(limit + 1); // Fetch one extra to check if more exist

  // Check if more updates exist beyond the limit
  const hasMore = updates.length > limit;

  // Return only up to the limit
  const returnedUpdates = updates.slice(0, limit);

  return {
    updates: returnedUpdates,
    hasMore,
    latestGlobalOrder,
  };
}
