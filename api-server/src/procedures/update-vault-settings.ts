import { ORPCError } from "@orpc/server";
import {
  UpdateVaultSettingsRequestSchema,
  UpdateVaultSettingsResponseSchema,
} from "../zod-schemas.js";
import { updateVaultSettings as updateVaultSettingsInDb } from "../db/models/vault.js";
import { sessionAuthedProcedure } from "./base.js";
import { MIN_USER_DIFFICULTY } from "../constants.js";

/**
 * Update vault settings procedure
 * Updates user-configurable vault settings (merges with existing)
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * Validates:
 * - messagingMinDifficulty >= MIN_USER_DIFFICULTY (256) if provided
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
      throw new ORPCError("FORBIDDEN", {
        message: "Session vault does not match input vault",
      });
    }

    // Validate messagingMinDifficulty if provided
    if (newSettings.messagingMinDifficulty !== undefined) {
      const difficultyBigInt = BigInt(newSettings.messagingMinDifficulty);
      const minBigInt = BigInt(MIN_USER_DIFFICULTY);
      if (difficultyBigInt < minBigInt) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Messaging difficulty must be at least ${MIN_USER_DIFFICULTY}`,
        });
      }
    }

    // Update settings using model function
    const settings = await updateVaultSettingsInDb(vaultId, newSettings);

    if (settings === null) {
      throw new ORPCError("NOT_FOUND", {
        message: "Vault not found",
      });
    }

    return { settings };
  });
