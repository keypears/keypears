import { ORPCError } from "@orpc/server";
import {
  SendMessageRequestSchema,
  SendMessageResponseSchema,
} from "../zod-schemas.js";
import { base } from "./base.js";
import { getVaultByNameAndDomain, getVaultSettings } from "../db/models/vault.js";
import {
  getEngagementKeyByPubKey,
  markEngagementKeyAsUsed,
} from "../db/models/engagement-key.js";
import { getOrCreateChannelView } from "../db/models/channel.js";
import { createInboxMessage } from "../db/models/inbox-message.js";
import { verifyAndConsume } from "../db/models/pow-challenge.js";
import { db } from "../db/index.js";
import { TableChannelView } from "../db/schema.js";
import { eq } from "drizzle-orm";

// Default difficulty (same as registration: ~4 million = 2^22)
const DEFAULT_MESSAGING_DIFFICULTY = 4194304n;

/**
 * Parse an address in the format "name@domain"
 * @param address - The address to parse
 * @returns Object with name and domain, or null if invalid format
 */
function parseAddress(address: string): { name: string; domain: string } | null {
  const atIndex = address.indexOf("@");
  if (atIndex === -1 || atIndex === 0 || atIndex === address.length - 1) {
    return null;
  }
  const name = address.slice(0, atIndex);
  const domain = address.slice(atIndex + 1);
  return { name, domain };
}

/**
 * Send message - public endpoint authenticated via PoW
 *
 * This endpoint allows anyone to send a message to a recipient, provided
 * they have completed the key exchange and solved the PoW challenge.
 *
 * The message flow:
 * 1. Sender gets their engagement key via getEngagementKeyForSending
 * 2. Sender gets recipient's key via getCounterpartyEngagementKey
 * 3. Sender encrypts message with ECDH shared secret
 * 4. Sender solves PoW challenge
 * 5. Sender calls sendMessage with encrypted content and PoW proof
 *
 * Security:
 * - Validates engagement key metadata (purpose, counterparty, pubkey)
 * - Verifies PoW proof meets minimum difficulty
 * - Marks engagement key as used (one message per key)
 * - Marks PoW challenge as used (prevents replay)
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
      solvedHeader,
      solvedHash,
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
    const engagementKey = await getEngagementKeyByPubKey(recipientEngagementPubKey);
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

    // - Must not already be used
    if (engagementKey.isUsed) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Engagement key has already been used",
      });
    }

    // 4. Get minimum difficulty from vault settings
    const settings = await getVaultSettings(vault.id);
    let minDifficulty = DEFAULT_MESSAGING_DIFFICULTY;
    if (settings?.messagingMinDifficulty) {
      minDifficulty = BigInt(settings.messagingMinDifficulty);
    }

    // 5. Verify PoW challenge
    const powResult = await verifyAndConsume(
      powChallengeId,
      solvedHeader,
      solvedHash,
      { minDifficulty },
    );

    if (!powResult.valid) {
      throw new ORPCError("BAD_REQUEST", {
        message: `PoW verification failed: ${powResult.message}`,
      });
    }

    // 6. Get or create channel_view for recipient
    const { channel } = await getOrCreateChannelView(
      recipientAddress, // ownerAddress (recipient)
      senderAddress, // counterpartyAddress (sender)
    );

    // 7. Mark engagement key as used
    await markEngagementKeyAsUsed(engagementKey.id);

    // 8. Create inbox message
    const message = await createInboxMessage({
      channelViewId: channel.id,
      senderAddress,
      encryptedContent,
      senderEngagementPubKey,
      recipientEngagementPubKey,
      powChallengeId,
    });

    // 9. Update channel updatedAt
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
