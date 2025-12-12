import { ORPCError } from "@orpc/server";
import { eq, and, lt, desc } from "drizzle-orm";
import {
  GetDerivedKeysRequestSchema,
  GetDerivedKeysResponseSchema,
} from "../zod-schemas.js";
import { sessionAuthedProcedure } from "./base.js";
import { db } from "../db/index.js";
import { TableDerivedKey } from "../db/schema.js";

/**
 * Get derived keys procedure
 * Returns a paginated list of derived keys for the vault
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * Pagination: Uses cursor-based pagination with beforeCreatedAt parameter
 * Results are ordered by createdAt DESC (newest first)
 */
export const getDerivedKeysProcedure = sessionAuthedProcedure
  .input(GetDerivedKeysRequestSchema)
  .output(GetDerivedKeysResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId, limit, beforeCreatedAt } = input;

    // Verify session's vaultId matches input vaultId
    if (vaultId !== sessionVaultId) {
      throw new ORPCError("FORBIDDEN", {
        message: "Session vault does not match input vault",
      });
    }

    // Build query conditions
    const conditions = [eq(TableDerivedKey.vaultId, vaultId)];

    if (beforeCreatedAt) {
      conditions.push(lt(TableDerivedKey.createdAt, beforeCreatedAt));
    }

    // Fetch one more than limit to determine if there are more results
    const results = await db
      .select({
        id: TableDerivedKey.id,
        derivedPubKey: TableDerivedKey.derivedPubKey,
        createdAt: TableDerivedKey.createdAt,
        isUsed: TableDerivedKey.isUsed,
      })
      .from(TableDerivedKey)
      .where(and(...conditions))
      .orderBy(desc(TableDerivedKey.createdAt))
      .limit(limit + 1);

    // Determine if there are more results
    const hasMore = results.length > limit;

    // Trim to requested limit
    const keys = results.slice(0, limit);

    return {
      keys,
      hasMore,
    };
  });
