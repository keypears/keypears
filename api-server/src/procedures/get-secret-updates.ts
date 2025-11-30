import {
  GetSecretUpdatesRequestSchema,
  GetSecretUpdatesResponseSchema,
} from "../zod-schemas.js";
import { getSecretUpdatesSince } from "../db/models/secret-update.js";
import { sessionAuthedProcedure } from "./base.js";

/**
 * Get secret updates procedure
 * Retrieves secret updates for polling/sync
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * Returns updates with globalOrder > sinceGlobalOrder
 * Ordered by globalOrder ASC (chronological)
 * Limited to prevent huge responses
 * Includes hasMore flag for pagination
 */
export const getSecretUpdatesProcedure = sessionAuthedProcedure
  .input(GetSecretUpdatesRequestSchema)
  .output(GetSecretUpdatesResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context; // vaultId from session
    const { vaultId, sinceGlobalOrder, limit } = input;

    // Verify session's vaultId matches input vaultId
    if (vaultId !== sessionVaultId) {
      throw new Error("Session vault does not match input vault");
    }

    // Get updates using model function
    return await getSecretUpdatesSince(vaultId, sinceGlobalOrder, limit);
  });
