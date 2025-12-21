import {
  GetVaultSettingsRequestSchema,
  GetVaultSettingsResponseSchema,
} from "@keypears/api-client";
import { getVaultSettings as getVaultSettingsFromDb } from "../db/models/vault.js";
import { sessionAuthedProcedure } from "./base.js";

/**
 * Get vault settings procedure
 * Retrieves user-configurable vault settings
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * Returns the settings object for the vault
 */
export const getVaultSettingsProcedure = sessionAuthedProcedure
  .input(GetVaultSettingsRequestSchema)
  .output(GetVaultSettingsResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId } = input;

    // Verify session's vaultId matches input vaultId
    if (vaultId !== sessionVaultId) {
      throw new Error("Session vault does not match input vault");
    }

    // Get settings using model function
    const settings = await getVaultSettingsFromDb(vaultId);

    if (settings === null) {
      throw new Error("Vault not found");
    }

    return { settings };
  });
