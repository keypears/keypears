import { ORPCError } from "@orpc/server";
import {
  SendMessageRequestSchema,
  SendMessageResponseSchema,
} from "../zod-schemas.js";
import { base } from "./base.js";
import { getVaultByNameAndDomain } from "../db/models/vault.js";
import { getEngagementKeyByPubKey } from "../db/models/engagement-key.js";
import { getOrCreateChannelView } from "../db/models/channel.js";
import { createInboxMessage } from "../db/models/inbox-message.js";
import { getChallenge } from "../db/models/pow-challenge.js";
import { db } from "../db/index.js";
import { TableChannelView } from "../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * Parse an address in the format "name@domain"
 * @param address - The address to parse
 * @returns Object with name and domain, or null if invalid format
 */
function parseAddress(
  address: string,
): { name: string; domain: string } | null {
  const atIndex = address.indexOf("@");
  if (atIndex === -1 || atIndex === 0 || atIndex === address.length - 1) {
    return null;
  }
  const name = address.slice(0, atIndex);
  const domain = address.slice(atIndex + 1);
  return { name, domain };
}

/**
 * Send message - public endpoint, PoW already consumed in getCounterpartyEngagementKey
 *
 * This endpoint allows anyone to send a message to a recipient, provided
 * they have completed the key exchange (which consumed the PoW).
 *
 * The message flow:
 * 1. Sender gets their engagement key via getEngagementKeyForSending (Alice's server)
 * 2. Sender gets PoW challenge from Bob's server
 * 3. Sender solves PoW challenge
 * 4. Sender gets recipient's key via getCounterpartyEngagementKey (PoW consumed here)
 * 5. Sender encrypts message with ECDH shared secret
 * 6. Sender calls sendMessage with encrypted content and PoW reference
 *
 * Security:
 * - Validates engagement key metadata (purpose, counterparty, pubkey)
 * - Verifies PoW was consumed for THIS sender+recipient pair (channel binding)
 * - PoW prevents DoS - it was already consumed in getCounterpartyEngagementKey
 */
export const sendMessageProcedure = base
  .input(SendMessageRequestSchema)
  .output(SendMessageResponseSchema)
  .handler(async ({ input }) => {
    const {
      recipientAddress,
      senderAddress,
      encryptedContent,
      senderEngagementPubKey,
      recipientEngagementPubKey,
      powChallengeId,
    } = input;

    // 1. Parse recipientAddress to get vault info
    const parsed = parseAddress(recipientAddress);
    if (!parsed) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid recipient address format: ${recipientAddress}. Expected format: name@domain`,
      });
    }

    // Look up recipient's vault
    const vault = await getVaultByNameAndDomain(parsed.name, parsed.domain);
    if (!vault) {
      throw new ORPCError("NOT_FOUND", {
        message: `Vault not found for address: ${recipientAddress}`,
      });
    }

    // 2. Look up engagement key by recipientEngagementPubKey
    const engagementKey = await getEngagementKeyByPubKey(
      recipientEngagementPubKey,
    );
    if (!engagementKey) {
      throw new ORPCError("NOT_FOUND", {
        message: "Recipient engagement key not found",
      });
    }

    // 3. Validate engagement key
    // - Must belong to the recipient's vault
    if (engagementKey.vaultId !== vault.id) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Engagement key does not belong to recipient's vault",
      });
    }

    // - Must have purpose "receive"
    if (engagementKey.purpose !== "receive") {
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid engagement key purpose: expected "receive", got "${engagementKey.purpose}"`,
      });
    }

    // - counterpartyAddress must match senderAddress
    if (engagementKey.counterpartyAddress !== senderAddress) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Sender address does not match engagement key counterparty",
      });
    }

    // - counterpartyPubKey must match senderEngagementPubKey
    if (engagementKey.counterpartyPubKey !== senderEngagementPubKey) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Sender public key does not match engagement key counterparty",
      });
    }

    // 4. Verify PoW was consumed for THIS sender+recipient pair
    // The PoW was already consumed in getCounterpartyEngagementKey, which stored
    // the channel binding info (senderAddress, recipientAddress, senderPubKey)
    const powChallenge = await getChallenge(powChallengeId);
    if (!powChallenge) {
      throw new ORPCError("BAD_REQUEST", {
        message: "PoW challenge not found",
      });
    }

    // Verify the PoW was consumed (isUsed = true)
    if (!powChallenge.isUsed) {
      throw new ORPCError("BAD_REQUEST", {
        message: "PoW challenge has not been consumed - call getCounterpartyEngagementKey first",
      });
    }

    // Verify channel binding - the PoW must have been consumed for THIS channel
    if (powChallenge.senderAddress !== senderAddress) {
      throw new ORPCError("BAD_REQUEST", {
        message: "PoW was consumed for a different sender",
      });
    }

    if (powChallenge.recipientAddress !== recipientAddress) {
      throw new ORPCError("BAD_REQUEST", {
        message: "PoW was consumed for a different recipient",
      });
    }

    if (powChallenge.senderPubKey !== senderEngagementPubKey) {
      throw new ORPCError("BAD_REQUEST", {
        message: "PoW was consumed with a different sender public key",
      });
    }

    // 5. Get or create channel_view for recipient
    const { channel } = await getOrCreateChannelView(
      recipientAddress, // ownerAddress (recipient)
      senderAddress, // counterpartyAddress (sender)
    );

    // 6. Create inbox message
    const message = await createInboxMessage({
      channelViewId: channel.id,
      senderAddress,
      encryptedContent,
      senderEngagementPubKey,
      recipientEngagementPubKey,
      powChallengeId,
    });

    // 7. Update channel updatedAt
    await db
      .update(TableChannelView)
      .set({ updatedAt: new Date() })
      .where(eq(TableChannelView.id, channel.id));

    return {
      messageId: message.id,
      orderInChannel: message.orderInChannel,
      createdAt: message.createdAt,
    };
  });
