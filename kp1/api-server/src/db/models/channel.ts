import { eq, and, lt, desc } from "drizzle-orm";
import { generateId } from "@keypears/lib";
import { db } from "../index.js";
import { TableChannelView } from "../schema.js";

/**
 * Channel view model interface
 * Represents a user's view of a conversation channel
 */
export interface ChannelView {
  id: string;
  ownerAddress: string;
  counterpartyAddress: string;
  minDifficulty: number | null;
  secretId: string; // Server-generated ID for vault storage (ensures consistency across devices)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new channel view
 *
 * @param params - Channel creation parameters
 * @returns The newly created channel view
 */
export async function createChannelView(params: {
  ownerAddress: string;
  counterpartyAddress: string;
}): Promise<ChannelView> {
  const { ownerAddress, counterpartyAddress } = params;
  const id = generateId();
  const secretId = generateId(); // Server-generated for vault storage consistency

  await db.insert(TableChannelView).values({
    id,
    ownerAddress,
    counterpartyAddress,
    secretId,
  });

  const channel = await getChannelViewById(id);
  if (!channel) {
    throw new Error("Failed to create channel view");
  }

  return channel;
}

/**
 * Get a channel view by its ID
 *
 * @param id - The channel view ID
 * @returns The channel view if found, null otherwise
 */
export async function getChannelViewById(
  id: string,
): Promise<ChannelView | null> {
  const result = await db
    .select()
    .from(TableChannelView)
    .where(eq(TableChannelView.id, id))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  return {
    id: row.id,
    ownerAddress: row.ownerAddress,
    counterpartyAddress: row.counterpartyAddress,
    minDifficulty: row.minDifficulty,
    secretId: row.secretId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Get a channel view by owner and counterparty addresses
 *
 * @param ownerAddress - The owner's address
 * @param counterpartyAddress - The counterparty's address
 * @returns The channel view if found, null otherwise
 */
export async function getChannelView(
  ownerAddress: string,
  counterpartyAddress: string,
): Promise<ChannelView | null> {
  const result = await db
    .select()
    .from(TableChannelView)
    .where(
      and(
        eq(TableChannelView.ownerAddress, ownerAddress),
        eq(TableChannelView.counterpartyAddress, counterpartyAddress),
      ),
    )
    .limit(1);

  const row = result[0];
  if (!row) return null;

  return {
    id: row.id,
    ownerAddress: row.ownerAddress,
    counterpartyAddress: row.counterpartyAddress,
    minDifficulty: row.minDifficulty,
    secretId: row.secretId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Get or create a channel view
 * Returns the existing channel if found, or creates a new one
 *
 * @param ownerAddress - The owner's address
 * @param counterpartyAddress - The counterparty's address
 * @returns Object containing the channel and whether it was newly created
 */
export async function getOrCreateChannelView(
  ownerAddress: string,
  counterpartyAddress: string,
): Promise<{ channel: ChannelView; isNew: boolean }> {
  // Check if channel already exists
  const existing = await getChannelView(ownerAddress, counterpartyAddress);
  if (existing) {
    return { channel: existing, isNew: false };
  }

  // Create new channel
  const channel = await createChannelView({
    ownerAddress,
    counterpartyAddress,
  });

  return { channel, isNew: true };
}

/**
 * Get all channels for an owner, sorted by updatedAt DESC
 *
 * @param ownerAddress - The owner's address
 * @param options - Pagination options
 * @returns Object containing channels and hasMore flag
 */
export async function getChannelsByOwner(
  ownerAddress: string,
  options?: { limit?: number; beforeUpdatedAt?: Date },
): Promise<{ channels: ChannelView[]; hasMore: boolean }> {
  const limit = options?.limit ?? 20;
  const beforeUpdatedAt = options?.beforeUpdatedAt;

  // Build query conditions
  const conditions = [eq(TableChannelView.ownerAddress, ownerAddress)];

  if (beforeUpdatedAt) {
    conditions.push(lt(TableChannelView.updatedAt, beforeUpdatedAt));
  }

  // Fetch limit + 1 to determine if more exist
  const results = await db
    .select()
    .from(TableChannelView)
    .where(and(...conditions))
    .orderBy(desc(TableChannelView.updatedAt))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const channels = results.slice(0, limit).map((row) => ({
    id: row.id,
    ownerAddress: row.ownerAddress,
    counterpartyAddress: row.counterpartyAddress,
    minDifficulty: row.minDifficulty,
    secretId: row.secretId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  return { channels, hasMore };
}

/**
 * Update the minimum difficulty for a channel view
 *
 * @param id - The channel view ID
 * @param minDifficulty - The new minimum difficulty (null to use global setting)
 * @returns The updated channel view, or null if not found
 */
export async function updateChannelMinDifficulty(
  id: string,
  minDifficulty: number | null,
): Promise<ChannelView | null> {
  await db
    .update(TableChannelView)
    .set({ minDifficulty, updatedAt: new Date() })
    .where(eq(TableChannelView.id, id));

  return getChannelViewById(id);
}
