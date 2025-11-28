import { eq, and, gt, max, desc } from "drizzle-orm";
import { os } from "@orpc/server";
import {
  GetSecretUpdatesRequestSchema,
  GetSecretUpdatesResponseSchema,
} from "../zod-schemas.js";
import { db } from "../db/index.js";
import { TableSecretUpdate } from "../db/schema.js";

/**
 * Get secret updates procedure
 * Retrieves secret updates for polling/sync
 *
 * Returns updates with globalOrder > sinceGlobalOrder
 * Ordered by globalOrder ASC (chronological)
 * Limited to prevent huge responses
 * Includes hasMore flag for pagination
 */
export const getSecretUpdatesProcedure = os
  .input(GetSecretUpdatesRequestSchema)
  .output(GetSecretUpdatesResponseSchema)
  .handler(async ({ input }) => {
    const { vaultId, sinceGlobalOrder, limit } = input;

    // Get the latest globalOrder for this vault
    const latestOrderResult = await db
      .select({
        maxOrder: max(TableSecretUpdate.globalOrder),
      })
      .from(TableSecretUpdate)
      .where(eq(TableSecretUpdate.vaultId, vaultId));

    const latestGlobalOrder = latestOrderResult[0]?.maxOrder ?? 0;

    // Fetch updates with globalOrder > sinceGlobalOrder
    // Fetch limit + 1 to determine if more exist
    const updates = await db
      .select({
        id: TableSecretUpdate.id,
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
  });
