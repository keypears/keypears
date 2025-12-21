import {
  CreateSecretUpdateRequestSchema,
  CreateSecretUpdateResponseSchema,
} from "@keypears/api-client";
import { createSecretUpdate } from "../db/models/secret-update.js";
import { sessionAuthedProcedure } from "./base.js";

/**
 * Create secret update procedure
 * Creates a new secret update with server-generated ID and order numbers
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
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
export const createSecretUpdateProcedure = sessionAuthedProcedure
  .input(CreateSecretUpdateRequestSchema)
  .output(CreateSecretUpdateResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context; // vaultId from session
    const { vaultId, secretId, encryptedBlob } = input;

    // Verify session's vaultId matches input vaultId
    if (vaultId !== sessionVaultId) {
      throw new Error("Session vault does not match input vault");
    }

    // Create secret update using model (handles transaction and order numbers)
    const result = await createSecretUpdate(vaultId, secretId, encryptedBlob);

    return {
      id: result.id,
      globalOrder: result.globalOrder,
      localOrder: result.localOrder,
      createdAt: result.createdAt,
    };
  });
