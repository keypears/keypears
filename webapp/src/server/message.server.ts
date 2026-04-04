import { db } from "~/db";
import { channels, messages } from "~/db/schema";
import { eq, desc, and, gt } from "drizzle-orm";

export async function getOrCreateChannelPair(
  userId: number,
  counterpartyId: number,
): Promise<{ senderChannelId: number; recipientChannelId: number }> {
  return db.transaction(async (tx) => {
    // Sender's channel
    const [senderRow] = await tx
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.ownerId, userId),
          eq(channels.counterpartyId, counterpartyId),
        ),
      )
      .limit(1);

    let senderChannelId: number;
    if (senderRow) {
      senderChannelId = senderRow.id;
    } else {
      const [result] = await tx
        .insert(channels)
        .values({ ownerId: userId, counterpartyId })
        .$returningId();
      senderChannelId = result.id;
    }

    // Recipient's channel
    const [recipientRow] = await tx
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.ownerId, counterpartyId),
          eq(channels.counterpartyId, userId),
        ),
      )
      .limit(1);

    let recipientChannelId: number;
    if (recipientRow) {
      recipientChannelId = recipientRow.id;
    } else {
      const [result] = await tx
        .insert(channels)
        .values({ ownerId: counterpartyId, counterpartyId: userId })
        .$returningId();
      recipientChannelId = result.id;
    }

    return { senderChannelId, recipientChannelId };
  });
}

export async function channelExists(
  userId: number,
  counterpartyId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(
      and(
        eq(channels.ownerId, userId),
        eq(channels.counterpartyId, counterpartyId),
      ),
    )
    .limit(1);
  return !!row;
}

export async function insertMessage(
  channelId: number,
  senderAddress: string,
  encryptedContent: string,
  senderPubKey: string,
  recipientPubKey: string,
) {
  await db.insert(messages).values({
    channelId,
    senderAddress,
    encryptedContent,
    senderPubKey,
    recipientPubKey,
  });
  await db
    .update(channels)
    .set({ updatedAt: new Date() })
    .where(eq(channels.id, channelId));
}

export async function getUserChannels(userId: number) {
  return db
    .select({
      id: channels.id,
      counterpartyId: channels.counterpartyId,
      updatedAt: channels.updatedAt,
    })
    .from(channels)
    .where(eq(channels.ownerId, userId))
    .orderBy(desc(channels.updatedAt));
}

export async function getChannelMessages(channelId: number, limit = 50) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.channelId, channelId))
    .orderBy(messages.createdAt)
    .limit(limit);
}

export async function getNewMessages(channelId: number, afterId: number) {
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.channelId, channelId), gt(messages.id, afterId)))
    .orderBy(messages.createdAt);
}

export async function getChannelById(channelId: number) {
  const [row] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  return row ?? null;
}
