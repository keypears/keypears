import { ORPCError } from "@orpc/server";
import {
  UpdateChannelMinDifficultyRequestSchema,
  UpdateChannelMinDifficultyResponseSchema,
} from "../zod-schemas.js";
import { sessionAuthedProcedure } from "./base.js";
import { getVaultById } from "../db/models/vault.js";
import {
  getChannelViewById,
  updateChannelMinDifficulty,
} from "../db/models/channel.js";
import { MIN_USER_DIFFICULTY } from "../constants.js";

/**
 * Update channel minimum difficulty - set per-channel PoW difficulty override
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * Validates:
 * - Channel exists and belongs to the authenticated vault
 * - minDifficulty >= MIN_USER_DIFFICULTY (256) if not null
 */
export const updateChannelMinDifficultyProcedure = sessionAuthedProcedure
  .input(UpdateChannelMinDifficultyRequestSchema)
  .output(UpdateChannelMinDifficultyResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { channelId, minDifficulty } = input;

    // 1. Get the channel
    const channel = await getChannelViewById(channelId);
    if (!channel) {
      throw new ORPCError("NOT_FOUND", {
        message: `Channel not found: ${channelId}`,
      });
    }

    // 2. Get the vault to verify ownership
    const vault = await getVaultById(sessionVaultId);
    if (!vault) {
      throw new ORPCError("NOT_FOUND", {
        message: `Vault not found: ${sessionVaultId}`,
      });
    }

    // 3. Verify channel belongs to this vault (ownerAddress = name@domain)
    const expectedOwnerAddress = `${vault.name}@${vault.domain}`;
    if (channel.ownerAddress !== expectedOwnerAddress) {
      throw new ORPCError("FORBIDDEN", {
        message: "Channel does not belong to this vault",
      });
    }

    // 4. Validate minDifficulty if provided
    if (minDifficulty !== null && minDifficulty < MIN_USER_DIFFICULTY) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Difficulty must be at least ${MIN_USER_DIFFICULTY}`,
      });
    }

    // 5. Update the channel
    const updated = await updateChannelMinDifficulty(channelId, minDifficulty);
    if (!updated) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to update channel difficulty",
      });
    }

    return {
      channelId: updated.id,
      minDifficulty: updated.minDifficulty,
    };
  });
