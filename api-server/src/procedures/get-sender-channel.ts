import { ORPCError } from "@orpc/server";
import {
  GetSenderChannelRequestSchema,
  GetSenderChannelResponseSchema,
} from "../zod-schemas.js";
import { sessionAuthedProcedure } from "./base.js";
import { getVaultById } from "../db/models/vault.js";
import { getOrCreateChannelView } from "../db/models/channel.js";

/**
 * Get sender channel - get or create the sender's channel_view for a counterparty
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * This endpoint is called by the sender after successfully sending a message.
 * It ensures the sender has a channel_view for the conversation, which is needed
 * to get the secretId for saving the message to their vault.
 */
export const getSenderChannelProcedure = sessionAuthedProcedure
  .input(GetSenderChannelRequestSchema)
  .output(GetSenderChannelResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId, counterpartyAddress } = input;

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

    // 3. Get or create the channel
    const { channel, isNew } = await getOrCreateChannelView(
      ownerAddress,
      counterpartyAddress,
    );

    return {
      channelId: channel.id,
      secretId: channel.secretId,
      isNew,
    };
  });
