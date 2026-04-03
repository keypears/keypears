import { ORPCError } from "@orpc/server";
import {
  GetInboxMessagesForSyncRequestSchema,
  GetInboxMessagesForSyncResponseSchema,
} from "@keypears/api-client";
import { sessionAuthedProcedure } from "./base.js";
import { getVaultById } from "../db/models/vault.js";
import { getInboxMessagesForSync } from "../db/models/inbox-message.js";

/**
 * Get inbox messages for sync - returns messages from saved channels
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * This endpoint returns inbox messages from channels with status "saved".
 * The client will:
 * 1. Decrypt each message using ECDH (with engagement key)
 * 2. Re-encrypt with vault key
 * 3. Save as secret_update
 * 4. Call deleteInboxMessages to remove synced messages
 *
 * Only messages from "saved" channels are returned - pending/ignored channels
 * keep messages in inbox without syncing to vault.
 */
export const getInboxMessagesForSyncProcedure = sessionAuthedProcedure
  .input(GetInboxMessagesForSyncRequestSchema)
  .output(GetInboxMessagesForSyncResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId, limit } = input;

    // 1. Verify session's vaultId matches input vaultId
    if (vaultId !== sessionVaultId) {
      throw new ORPCError("FORBIDDEN", {
        message: "Session vault does not match input vault",
      });
    }

    // 2. Look up the vault to get owner's address
    const vault = await getVaultById(vaultId);
    if (!vault) {
      throw new ORPCError("NOT_FOUND", {
        message: `Vault not found: ${vaultId}`,
      });
    }

    // Construct the owner's address from vault name and domain
    const ownerAddress = `${vault.name}@${vault.domain}`;

    // 3. Get inbox messages for saved channels
    const messages = await getInboxMessagesForSync(ownerAddress, { limit });

    // 4. Return messages with info needed for sync
    return {
      messages: messages.map((msg) => ({
        id: msg.id,
        channelSecretId: msg.channelSecretId,
        counterpartyAddress: msg.counterpartyAddress,
        senderAddress: msg.senderAddress,
        orderInChannel: msg.orderInChannel,
        encryptedContent: msg.encryptedContent,
        senderEngagementPubKey: msg.senderEngagementPubKey,
        recipientEngagementPubKey: msg.recipientEngagementPubKey,
        createdAt: msg.createdAt,
      })),
    };
  });
