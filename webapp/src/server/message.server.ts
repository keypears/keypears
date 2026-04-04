import { db, pool } from "~/db";
import { channels, messages } from "~/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function getOrCreateChannelPair(
  userId: number,
  counterpartyId: number,
): Promise<{ senderChannelId: number; recipientChannelId: number }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Check if sender's channel exists
    const [senderRows] = await conn.query(
      `SELECT id FROM channels WHERE owner_id = ? AND counterparty_id = ?`,
      [userId, counterpartyId],
    );
    let senderChannelId: number;
    if (Array.isArray(senderRows) && senderRows.length > 0) {
      senderChannelId = (senderRows[0] as any).id;
    } else {
      const [result] = await conn.query(
        `INSERT INTO channels (owner_id, counterparty_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
        [userId, counterpartyId],
      );
      senderChannelId = (result as any).insertId;
    }

    // Check if recipient's channel exists
    const [recipientRows] = await conn.query(
      `SELECT id FROM channels WHERE owner_id = ? AND counterparty_id = ?`,
      [counterpartyId, userId],
    );
    let recipientChannelId: number;
    if (Array.isArray(recipientRows) && recipientRows.length > 0) {
      recipientChannelId = (recipientRows[0] as any).id;
    } else {
      const [result] = await conn.query(
        `INSERT INTO channels (owner_id, counterparty_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
        [counterpartyId, userId],
      );
      recipientChannelId = (result as any).insertId;
    }

    await conn.commit();
    return { senderChannelId, recipientChannelId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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

export async function getChannelMessages(
  channelId: number,
  limit = 50,
) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.channelId, channelId))
    .orderBy(messages.createdAt)
    .limit(limit);
}

export async function getChannelById(channelId: number) {
  const [row] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  return row ?? null;
}
