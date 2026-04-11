import { db } from "~/db";
import { channels, messages, vaultEntries } from "~/db/schema";
import { eq, desc, and, gt, lt, count, sql } from "drizzle-orm";
import { newId } from "./utils";

export async function getOrCreateChannel(
  ownerId: string,
  counterpartyAddress: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.ownerId, ownerId),
          eq(channels.counterpartyAddress, counterpartyAddress),
        ),
      )
      .limit(1);

    if (existing) return existing.id;

    const id = newId();
    await tx
      .insert(channels)
      .values({ id, ownerId, counterpartyAddress });
    return id;
  });
}

export async function getOrCreateChannelPair(
  userId: string,
  counterpartyUserId: string,
  senderAddress: string,
  recipientAddress: string,
): Promise<{ senderChannelId: string; recipientChannelId: string }> {
  const senderChannelId = await getOrCreateChannel(userId, recipientAddress);
  const recipientChannelId = await getOrCreateChannel(
    counterpartyUserId,
    senderAddress,
  );
  return { senderChannelId, recipientChannelId };
}

export async function channelExists(
  userId: string,
  counterpartyAddress: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(
      and(
        eq(channels.ownerId, userId),
        eq(channels.counterpartyAddress, counterpartyAddress),
      ),
    )
    .limit(1);
  return !!row;
}

export async function insertMessage(
  channelId: string,
  senderAddress: string,
  encryptedContent: string,
  senderPubKey: string,
  recipientPubKey: string,
  isRead: boolean,
) {
  const id = newId();
  await db.insert(messages).values({
    id,
    channelId,
    senderAddress,
    encryptedContent,
    senderPubKey,
    recipientPubKey,
    isRead,
  });
  await db
    .update(channels)
    .set({ updatedAt: new Date() })
    .where(eq(channels.id, channelId));
}

export async function markChannelRead(channelId: string) {
  await db
    .update(messages)
    .set({ isRead: true })
    .where(and(eq(messages.channelId, channelId), eq(messages.isRead, false)));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [result] = await db
    .select({ cnt: count() })
    .from(messages)
    .innerJoin(channels, eq(messages.channelId, channels.id))
    .where(and(eq(channels.ownerId, userId), eq(messages.isRead, false)));
  return result.cnt;
}

export async function getChannelUnreadCounts(userId: string) {
  return db
    .select({
      channelId: messages.channelId,
      cnt: count(),
    })
    .from(messages)
    .innerJoin(channels, eq(messages.channelId, channels.id))
    .where(and(eq(channels.ownerId, userId), eq(messages.isRead, false)))
    .groupBy(messages.channelId);
}

export async function getUserChannels(userId: string) {
  return db
    .select({
      id: channels.id,
      counterpartyAddress: channels.counterpartyAddress,
      updatedAt: channels.updatedAt,
    })
    .from(channels)
    .where(eq(channels.ownerId, userId))
    .orderBy(desc(channels.updatedAt));
}

export async function getChannelMessages(
  channelId: string,
  userId: string,
  limit = 20,
  beforeId?: string,
) {
  const conditions = beforeId
    ? and(eq(messages.channelId, channelId), lt(messages.id, beforeId))
    : eq(messages.channelId, channelId);

  const rows = await db
    .select({
      id: messages.id,
      channelId: messages.channelId,
      senderAddress: messages.senderAddress,
      encryptedContent: messages.encryptedContent,
      senderPubKey: messages.senderPubKey,
      recipientPubKey: messages.recipientPubKey,
      isRead: messages.isRead,
      createdAt: messages.createdAt,
      isSaved: sql<boolean>`(${vaultEntries.id} IS NOT NULL)`,
    })
    .from(messages)
    .leftJoin(
      vaultEntries,
      and(
        eq(vaultEntries.sourceMessageId, messages.id),
        eq(vaultEntries.userId, userId),
      ),
    )
    .where(conditions)
    .orderBy(desc(messages.id))
    .limit(limit);

  return rows.toReversed();
}

export async function getNewMessages(
  channelId: string,
  userId: string,
  afterId: string,
) {
  return db
    .select({
      id: messages.id,
      channelId: messages.channelId,
      senderAddress: messages.senderAddress,
      encryptedContent: messages.encryptedContent,
      senderPubKey: messages.senderPubKey,
      recipientPubKey: messages.recipientPubKey,
      isRead: messages.isRead,
      createdAt: messages.createdAt,
      isSaved: sql<boolean>`(${vaultEntries.id} IS NOT NULL)`,
    })
    .from(messages)
    .leftJoin(
      vaultEntries,
      and(
        eq(vaultEntries.sourceMessageId, messages.id),
        eq(vaultEntries.userId, userId),
      ),
    )
    .where(and(eq(messages.channelId, channelId), gt(messages.id, afterId)))
    .orderBy(messages.createdAt);
}

export async function getChannelById(channelId: string) {
  const [row] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  return row ?? null;
}

export async function getChannelByCounterparty(
  ownerId: string,
  counterpartyAddress: string,
) {
  const [row] = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.ownerId, ownerId),
        eq(channels.counterpartyAddress, counterpartyAddress),
      ),
    )
    .limit(1);
  return row ?? null;
}
