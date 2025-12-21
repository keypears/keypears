import { ORPCError } from "@orpc/server";
import {
  GetChannelMessagesRequestSchema,
  GetChannelMessagesResponseSchema,
} from "@keypears/api-client";
import { sessionAuthedProcedure } from "./base.js";
import { getVaultById } from "../db/models/vault.js";
import { getChannelViewById } from "../db/models/channel.js";
import { getMessagesByChannel } from "../db/models/inbox-message.js";

/**
 * Get channel messages - returns messages in reverse chronological order
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * Returns messages ordered by orderInChannel DESC (most recent first).
 * Use beforeOrder for pagination to fetch older messages.
 */
export const getChannelMessagesProcedure = sessionAuthedProcedure
  .input(GetChannelMessagesRequestSchema)
  .output(GetChannelMessagesResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId, channelId, limit, beforeOrder } = input;

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

    // 4. Call getMessagesByChannel model function (returns DESC order)
    const options: { limit: number; beforeOrder?: number } = { limit };
    if (beforeOrder !== undefined) {
      options.beforeOrder = beforeOrder;
    }
    const { messages: rawMessages, hasMore } = await getMessagesByChannel(
      channelId,
      options,
    );

    // Map messages to response format
    const messages = rawMessages.map((msg) => ({
      id: msg.id,
      senderAddress: msg.senderAddress,
      orderInChannel: msg.orderInChannel,
      encryptedContent: msg.encryptedContent,
      senderEngagementPubKey: msg.senderEngagementPubKey,
      recipientEngagementPubKey: msg.recipientEngagementPubKey,
      isRead: msg.isRead,
      createdAt: msg.createdAt,
    }));

    return { messages, hasMore };
  });
