import { ORPCError } from "@orpc/server";
import {
  DeleteInboxMessagesRequestSchema,
  DeleteInboxMessagesResponseSchema,
} from "../zod-schemas.js";
import { sessionAuthedProcedure } from "./base.js";
import { getVaultById } from "../db/models/vault.js";
import {
  getInboxMessageById,
  deleteInboxMessages,
} from "../db/models/inbox-message.js";
import { getChannelViewById } from "../db/models/channel.js";

/**
 * Delete inbox messages - remove messages after they've been synced to vault
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * This endpoint is called after the client has successfully synced inbox messages
 * to the vault. It removes the messages from the inbox to prevent duplicate syncs.
 *
 * Security: Validates that each message belongs to a channel owned by the vault.
 */
export const deleteInboxMessagesProcedure = sessionAuthedProcedure
  .input(DeleteInboxMessagesRequestSchema)
  .output(DeleteInboxMessagesResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId, messageIds } = input;

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

    const ownerAddress = `${vault.name}@${vault.domain}`;

    // 3. Validate each message belongs to a channel owned by this vault
    // This prevents deleting messages from other users' inboxes
    const validMessageIds: string[] = [];

    for (const messageId of messageIds) {
      const message = await getInboxMessageById(messageId);
      if (!message) {
        // Message doesn't exist - skip silently (may have been deleted already)
        continue;
      }

      const channel = await getChannelViewById(message.channelViewId);
      if (!channel) {
        // Channel doesn't exist - skip
        continue;
      }

      if (channel.ownerAddress !== ownerAddress) {
        // Message doesn't belong to this vault's channels - skip
        continue;
      }

      validMessageIds.push(messageId);
    }

    // 4. Delete the validated messages
    const deletedCount = await deleteInboxMessages(validMessageIds);

    return { deletedCount };
  });
