import {
  UpdateVaultSettingsRequestSchema,
  UpdateVaultSettingsResponseSchema,
} from "../zod-schemas.js";
import { updateVaultSettings as updateVaultSettingsInDb } from "../db/models/vault.js";
import { sessionAuthedProcedure } from "./base.js";

/**
 * Update vault settings procedure
 * Updates user-configurable vault settings (merges with existing)
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * Merges provided settings with existing settings
 * Returns the updated settings object
 */
export const updateVaultSettingsProcedure = sessionAuthedProcedure
  .input(UpdateVaultSettingsRequestSchema)
  .output(UpdateVaultSettingsResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId, settings: newSettings } = input;

    // Verify session's vaultId matches input vaultId
    if (vaultId !== sessionVaultId) {
      throw new Error("Session vault does not match input vault");
    }

    // Update settings using model function
    const settings = await updateVaultSettingsInDb(vaultId, newSettings);

    if (settings === null) {
      throw new Error("Vault not found");
    }

    return { settings };
  });
