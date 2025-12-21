import { eq, and, lt, desc, max, count, inArray } from "drizzle-orm";
import { generateId } from "@keypears/lib";
import { db } from "../index.js";
import { TableInboxMessage, TableChannelView } from "../schema.js";

/**
 * Inbox message model interface
 * Represents a received message in a channel
 */
export interface InboxMessage {
  id: string;
  channelViewId: string;
  senderAddress: string;
  orderInChannel: number;
  encryptedContent: string;
  senderEngagementPubKey: string;
  recipientEngagementPubKey: string;
  powChallengeId: string;
  isRead: boolean;
  createdAt: Date;
  expiresAt: Date | null;
}

/**
 * Create a new inbox message
 * The orderInChannel is auto-generated as max + 1 within a transaction
 *
 * @param params - Message creation parameters
 * @returns The newly created inbox message
 */
export async function createInboxMessage(params: {
  channelViewId: string;
  senderAddress: string;
  encryptedContent: string;
  senderEngagementPubKey: string;
  recipientEngagementPubKey: string;
  powChallengeId: string;
  expiresAt?: Date;
}): Promise<InboxMessage> {
  const {
    channelViewId,
    senderAddress,
    encryptedContent,
    senderEngagementPubKey,
    recipientEngagementPubKey,
    powChallengeId,
    expiresAt,
  } = params;

  const messageId = generateId();

  // Use transaction to atomically get order number and insert
  const result = await db.transaction(async (tx) => {
    // Get the current max orderInChannel for this channel
    const orderResult = await tx
      .select({
        maxOrder: max(TableInboxMessage.orderInChannel),
      })
      .from(TableInboxMessage)
      .where(eq(TableInboxMessage.channelViewId, channelViewId));

    const nextOrder = (orderResult[0]?.maxOrder ?? 0) + 1;

    // Insert the new message
    await tx.insert(TableInboxMessage).values({
      id: messageId,
      channelViewId,
      senderAddress,
      orderInChannel: nextOrder,
      encryptedContent,
      senderEngagementPubKey,
      recipientEngagementPubKey,
      powChallengeId,
      expiresAt: expiresAt ?? null,
    });

    // Fetch the created record
    const created = await tx
      .select()
      .from(TableInboxMessage)
      .where(eq(TableInboxMessage.id, messageId))
      .limit(1);

    return created[0];
  });

  if (!result) {
    throw new Error("Failed to create inbox message");
  }

  return {
    id: result.id,
    channelViewId: result.channelViewId,
    senderAddress: result.senderAddress,
    orderInChannel: result.orderInChannel,
    encryptedContent: result.encryptedContent,
    senderEngagementPubKey: result.senderEngagementPubKey,
    recipientEngagementPubKey: result.recipientEngagementPubKey,
    powChallengeId: result.powChallengeId,
    isRead: result.isRead,
    createdAt: result.createdAt,
    expiresAt: result.expiresAt,
  };
}

/**
 * Get an inbox message by its ID
 *
 * @param id - The message ID
 * @returns The message if found, null otherwise
 */
export async function getInboxMessageById(
  id: string,
): Promise<InboxMessage | null> {
  const result = await db
    .select()
    .from(TableInboxMessage)
    .where(eq(TableInboxMessage.id, id))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  return {
    id: row.id,
    channelViewId: row.channelViewId,
    senderAddress: row.senderAddress,
    orderInChannel: row.orderInChannel,
    encryptedContent: row.encryptedContent,
    senderEngagementPubKey: row.senderEngagementPubKey,
    recipientEngagementPubKey: row.recipientEngagementPubKey,
    powChallengeId: row.powChallengeId,
    isRead: row.isRead,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

/**
 * Get messages for a channel, ordered by orderInChannel DESC (reverse chronological)
 * Returns most recent messages first, consistent with other lists in the app
 *
 * @param channelViewId - The channel view ID
 * @param options - Pagination options
 * @returns Object containing messages and hasMore flag (true if older messages exist)
 */
export async function getMessagesByChannel(
  channelViewId: string,
  options?: { limit?: number; beforeOrder?: number },
): Promise<{ messages: InboxMessage[]; hasMore: boolean }> {
  const limit = options?.limit ?? 50;
  const beforeOrder = options?.beforeOrder;

  // Build query conditions
  const conditions = [eq(TableInboxMessage.channelViewId, channelViewId)];

  if (beforeOrder !== undefined) {
    conditions.push(lt(TableInboxMessage.orderInChannel, beforeOrder));
  }

  // Fetch limit + 1 to determine if more (older) messages exist
  const results = await db
    .select()
    .from(TableInboxMessage)
    .where(and(...conditions))
    .orderBy(desc(TableInboxMessage.orderInChannel))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const messages = results.slice(0, limit).map((row) => ({
    id: row.id,
    channelViewId: row.channelViewId,
    senderAddress: row.senderAddress,
    orderInChannel: row.orderInChannel,
    encryptedContent: row.encryptedContent,
    senderEngagementPubKey: row.senderEngagementPubKey,
    recipientEngagementPubKey: row.recipientEngagementPubKey,
    powChallengeId: row.powChallengeId,
    isRead: row.isRead,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  }));

  return { messages, hasMore };
}

/**
 * Mark a single message as read
 *
 * @param id - The message ID
 */
export async function markMessageAsRead(id: string): Promise<void> {
  await db
    .update(TableInboxMessage)
    .set({ isRead: true })
    .where(eq(TableInboxMessage.id, id));
}

/**
 * Mark all messages in a channel as read
 *
 * @param channelViewId - The channel view ID
 */
export async function markAllMessagesAsRead(
  channelViewId: string,
): Promise<void> {
  await db
    .update(TableInboxMessage)
    .set({ isRead: true })
    .where(
      and(
        eq(TableInboxMessage.channelViewId, channelViewId),
        eq(TableInboxMessage.isRead, false),
      ),
    );
}

/**
 * Get the count of unread messages for a channel
 *
 * @param channelViewId - The channel view ID
 * @returns The number of unread messages
 */
export async function getUnreadCount(channelViewId: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(TableInboxMessage)
    .where(
      and(
        eq(TableInboxMessage.channelViewId, channelViewId),
        eq(TableInboxMessage.isRead, false),
      ),
    );

  return result[0]?.count ?? 0;
}

/**
 * Get the total count of unread messages across all channels for an owner
 *
 * @param ownerAddress - The owner's address
 * @returns The total number of unread messages
 */
export async function getUnreadCountByOwner(
  ownerAddress: string,
): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(TableInboxMessage)
    .innerJoin(
      TableChannelView,
      eq(TableInboxMessage.channelViewId, TableChannelView.id),
    )
    .where(
      and(
        eq(TableChannelView.ownerAddress, ownerAddress),
        eq(TableInboxMessage.isRead, false),
      ),
    );

  return result[0]?.count ?? 0;
}

/**
 * Get the timestamp of the most recent message in a channel
 *
 * @param channelViewId - The channel view ID
 * @returns The timestamp of the last message, or null if no messages
 */
export async function getLastMessageTimestamp(
  channelViewId: string,
): Promise<Date | null> {
  const result = await db
    .select({ createdAt: TableInboxMessage.createdAt })
    .from(TableInboxMessage)
    .where(eq(TableInboxMessage.channelViewId, channelViewId))
    .orderBy(desc(TableInboxMessage.orderInChannel))
    .limit(1);

  return result[0]?.createdAt ?? null;
}

/**
 * Inbox message with channel info for sync
 * Includes the channel's secretId for vault storage
 */
export interface InboxMessageForSync extends InboxMessage {
  channelSecretId: string;
  counterpartyAddress: string;
}

/**
 * Get inbox messages for saved channels (for vault sync)
 * Returns messages from channels with status "saved" for a given owner
 *
 * @param ownerAddress - The owner's address (e.g., "alice@example.com")
 * @param options - Pagination options
 * @returns Array of messages with channel info for syncing to vault
 */
export async function getInboxMessagesForSync(
  ownerAddress: string,
  options?: { limit?: number },
): Promise<InboxMessageForSync[]> {
  const limit = options?.limit ?? 100;

  // Join inbox_message with channel_view to get all messages for the owner
  const results = await db
    .select({
      id: TableInboxMessage.id,
      channelViewId: TableInboxMessage.channelViewId,
      senderAddress: TableInboxMessage.senderAddress,
      orderInChannel: TableInboxMessage.orderInChannel,
      encryptedContent: TableInboxMessage.encryptedContent,
      senderEngagementPubKey: TableInboxMessage.senderEngagementPubKey,
      recipientEngagementPubKey: TableInboxMessage.recipientEngagementPubKey,
      powChallengeId: TableInboxMessage.powChallengeId,
      isRead: TableInboxMessage.isRead,
      createdAt: TableInboxMessage.createdAt,
      expiresAt: TableInboxMessage.expiresAt,
      channelSecretId: TableChannelView.secretId,
      counterpartyAddress: TableChannelView.counterpartyAddress,
    })
    .from(TableInboxMessage)
    .innerJoin(
      TableChannelView,
      eq(TableInboxMessage.channelViewId, TableChannelView.id),
    )
    .where(eq(TableChannelView.ownerAddress, ownerAddress))
    .orderBy(TableInboxMessage.createdAt)
    .limit(limit);

  return results.map((row) => ({
    id: row.id,
    channelViewId: row.channelViewId,
    senderAddress: row.senderAddress,
    orderInChannel: row.orderInChannel,
    encryptedContent: row.encryptedContent,
    senderEngagementPubKey: row.senderEngagementPubKey,
    recipientEngagementPubKey: row.recipientEngagementPubKey,
    powChallengeId: row.powChallengeId,
    isRead: row.isRead,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    channelSecretId: row.channelSecretId,
    counterpartyAddress: row.counterpartyAddress,
  }));
}

/**
 * Delete inbox messages by their IDs
 * Used after messages have been synced to the vault
 *
 * @param ids - Array of message IDs to delete
 * @returns Number of messages deleted
 */
export async function deleteInboxMessages(ids: string[]): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }

  // Delete each message - drizzle doesn't return count for bulk deletes
  await db.delete(TableInboxMessage).where(inArray(TableInboxMessage.id, ids));

  // Return the number of IDs we attempted to delete
  // (actual count may differ if some were already deleted)
  return ids.length;
}
