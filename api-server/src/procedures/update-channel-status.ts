import { ORPCError } from "@orpc/server";
import {
  UpdateChannelStatusRequestSchema,
  UpdateChannelStatusResponseSchema,
} from "../zod-schemas.js";
import { sessionAuthedProcedure } from "./base.js";
import { getVaultById } from "../db/models/vault.js";
import {
  getChannelViewById,
  updateChannelStatus as updateStatus,
} from "../db/models/channel.js";

/**
 * Update channel status - change status of a channel (pending/saved/ignored)
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * Status values:
 * - "pending": User hasn't decided yet (default, or moved back to pending)
 * - "saved": Channel is saved to user's vault (accepted)
 * - "ignored": Hidden from main feed, only visible in "ignored" feed
 */
export const updateChannelStatusProcedure = sessionAuthedProcedure
  .input(UpdateChannelStatusRequestSchema)
  .output(UpdateChannelStatusResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId, channelId, status } = input;

    // 1. Verify session's vaultId matches input vaultId
    if (vaultId !== sessionVaultId) {
      throw new ORPCError("FORBIDDEN", {
        message: "Session vault does not match input vault",
      });
    }

    // 2. Get channel by ID
    const channel = await getChannelViewById(channelId);
    if (!channel) {
      throw new ORPCError("NOT_FOUND", {
        message: `Channel not found: ${channelId}`,
      });
    }

    // 3. Verify channel belongs to this vault's address
    const vault = await getVaultById(vaultId);
    if (!vault) {
      throw new ORPCError("NOT_FOUND", {
        message: `Vault not found: ${vaultId}`,
      });
    }

    // Parse channel's ownerAddress to verify it matches the vault
    const atIndex = channel.ownerAddress.indexOf("@");
    if (atIndex === -1) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Invalid channel owner address format",
      });
    }

    const name = channel.ownerAddress.slice(0, atIndex);
    const domain = channel.ownerAddress.slice(atIndex + 1);

    if (name !== vault.name || domain !== vault.domain) {
      throw new ORPCError("FORBIDDEN", {
        message: "Channel does not belong to this vault",
      });
    }

    // 4. Call updateChannelStatus model function
    const updated = await updateStatus(channelId, status);
    if (!updated) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to update channel status",
      });
    }

    return {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt,
    };
  });
