import { ORPCError } from "@orpc/server";
import {
  GetChannelsRequestSchema,
  GetChannelsResponseSchema,
} from "@keypears/api-client";
import { sessionAuthedProcedure } from "./base.js";
import { getVaultById } from "../db/models/vault.js";
import { getChannelsByOwner } from "../db/models/channel.js";
import {
  getUnreadCount,
  getLastMessageTimestamp,
} from "../db/models/inbox-message.js";

/**
 * Get channels - list channels for an address with pagination
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * Returns channels in reverse chronological order (most recently updated first),
 * including unread message counts and last message timestamps for each channel.
 */
export const getChannelsProcedure = sessionAuthedProcedure
  .input(GetChannelsRequestSchema)
  .output(GetChannelsResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId, ownerAddress, limit, beforeUpdatedAt } = input;

    // 1. Verify session's vaultId matches input vaultId
    if (vaultId !== sessionVaultId) {
      throw new ORPCError("FORBIDDEN", {
        message: "Session vault does not match input vault",
      });
    }

    // 2. Verify ownerAddress belongs to this vault (name@domain format)
    const vault = await getVaultById(vaultId);
    if (!vault) {
      throw new ORPCError("NOT_FOUND", {
        message: `Vault not found: ${vaultId}`,
      });
    }

    // Parse ownerAddress to verify it matches the vault
    const atIndex = ownerAddress.indexOf("@");
    if (atIndex === -1) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid owner address format: ${ownerAddress}. Expected format: name@domain`,
      });
    }

    const name = ownerAddress.slice(0, atIndex);
    const domain = ownerAddress.slice(atIndex + 1);

    if (name !== vault.name || domain !== vault.domain) {
      throw new ORPCError("FORBIDDEN", {
        message: "Owner address does not belong to this vault",
      });
    }

    // 3. Call getChannelsByOwner model function
    const options: { limit: number; beforeUpdatedAt?: Date } = { limit };
    if (beforeUpdatedAt !== undefined) {
      options.beforeUpdatedAt = beforeUpdatedAt;
    }
    const { channels: rawChannels, hasMore } = await getChannelsByOwner(
      ownerAddress,
      options,
    );

    // 4. For each channel, get unread count and last message timestamp
    const channels = await Promise.all(
      rawChannels.map(async (channel) => {
        const [unreadCount, lastMessageAt] = await Promise.all([
          getUnreadCount(channel.id),
          getLastMessageTimestamp(channel.id),
        ]);

        return {
          id: channel.id,
          counterpartyAddress: channel.counterpartyAddress,
          minDifficulty: channel.minDifficulty,
          secretId: channel.secretId,
          unreadCount,
          lastMessageAt,
          createdAt: channel.createdAt,
          updatedAt: channel.updatedAt,
        };
      }),
    );

    return { channels, hasMore };
  });
