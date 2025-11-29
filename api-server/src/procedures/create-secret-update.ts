import { eq, and, max, sql } from "drizzle-orm";
import { ulid } from "ulid";
import {
  CreateSecretUpdateRequestSchema,
  CreateSecretUpdateResponseSchema,
} from "../zod-schemas.js";
import { db } from "../db/index.js";
import { TableSecretUpdate } from "../db/schema.js";
import { vaultAuthedProcedure, validateVaultAuth } from "./base.js";

/**
 * Create secret update procedure
 * Creates a new secret update with server-generated ID and order numbers
 *
 * Authentication: Requires valid login key in X-Vault-Login-Key header
 *
 * Order number generation:
 * - globalOrder: vault-wide sequential counter (1, 2, 3, ...)
 * - localOrder: per-secret sequential counter (1, 2, 3, ...)
 *
 * Uses database transaction to ensure atomicity:
 * 1. Get max globalOrder for vault
 * 2. Get max localOrder for secret
 * 3. Insert with incremented order numbers
 */
export const createSecretUpdateProcedure = vaultAuthedProcedure
  .input(CreateSecretUpdateRequestSchema)
  .output(CreateSecretUpdateResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId, secretId, encryptedBlob } = input;

    // Validate login key for this vault
    await validateVaultAuth(context.loginKey, vaultId);

    // Generate ULID for the new update
    const updateId = ulid();

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

    return {
      id: result.id,
      globalOrder: result.globalOrder,
      localOrder: result.localOrder,
      createdAt: result.createdAt,
    };
  });
