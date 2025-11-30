import {
  GetSecretUpdatesRequestSchema,
  GetSecretUpdatesResponseSchema,
} from "../zod-schemas.js";
import { getSecretUpdatesSince } from "../db/models/secret-update.js";
import { vaultAuthedProcedure, validateVaultAuth } from "./base.js";

/**
 * Get secret updates procedure
 * Retrieves secret updates for polling/sync
 *
 * Authentication: Requires valid login key in X-Vault-Login-Key header
 *
 * Returns updates with globalOrder > sinceGlobalOrder
 * Ordered by globalOrder ASC (chronological)
 * Limited to prevent huge responses
 * Includes hasMore flag for pagination
 */
export const getSecretUpdatesProcedure = vaultAuthedProcedure
  .input(GetSecretUpdatesRequestSchema)
  .output(GetSecretUpdatesResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId, sinceGlobalOrder, limit } = input;

    // Validate login key for this vault
    await validateVaultAuth(context.loginKey, vaultId);

    // Get updates using model function
    return await getSecretUpdatesSince(vaultId, sinceGlobalOrder, limit);
  });
