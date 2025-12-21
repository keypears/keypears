import { eq, and } from "drizzle-orm";
import { db } from "../index.js";
import { TableEngagementKey } from "../schema.js";
import type { EngagementKeyPurpose } from "../../zod-schemas.js";

/**
 * Engagement key model interface
 * Represents a server-generated engagement key for DH key exchange
 */
export interface EngagementKey {
  id: string;
  vaultId: string;
  dbEntropy: string;
  dbEntropyHash: string;
  serverEntropyIndex: number;
  derivationPubKey: string;
  engagementPubKey: string;
  engagementPubKeyHash: string;
  counterpartyAddress: string | null;
  purpose: EngagementKeyPurpose;
  counterpartyPubKey: string | null;
  vaultGeneration: number;
  createdAt: Date;
}

/**
 * Convert a database row to EngagementKey interface
 */
function rowToEngagementKey(
  row: typeof TableEngagementKey.$inferSelect,
): EngagementKey {
  return {
    id: row.id,
    vaultId: row.vaultId,
    dbEntropy: row.dbEntropy,
    dbEntropyHash: row.dbEntropyHash,
    serverEntropyIndex: row.serverEntropyIndex,
    derivationPubKey: row.derivationPubKey,
    engagementPubKey: row.engagementPubKey,
    engagementPubKeyHash: row.engagementPubKeyHash,
    counterpartyAddress: row.counterpartyAddress,
    purpose: row.purpose as EngagementKeyPurpose,
    counterpartyPubKey: row.counterpartyPubKey,
    vaultGeneration: row.vaultGeneration,
    createdAt: row.createdAt,
  };
}

/**
 * Get an engagement key by its public key
 * Used for message validation when receiving messages
 *
 * @param pubKey - The engagement public key (66 chars hex)
 * @returns The engagement key if found, null otherwise
 */
export async function getEngagementKeyByPubKey(
  pubKey: string,
): Promise<EngagementKey | null> {
  const result = await db
    .select()
    .from(TableEngagementKey)
    .where(eq(TableEngagementKey.engagementPubKey, pubKey))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  return rowToEngagementKey(row);
}

/**
 * Get an existing engagement key for receiving from a counterparty
 * Used for idempotent key exchange (DoS prevention)
 * If the same sender sends the same public key, return the same engagement key
 *
 * @param vaultId - The vault ID (recipient)
 * @param counterpartyAddress - The sender's address (e.g., "alice@example.com")
 * @param counterpartyPubKey - The sender's engagement public key
 * @returns The engagement key if found, null otherwise
 */
export async function getEngagementKeyForReceiving(
  vaultId: string,
  counterpartyAddress: string,
  counterpartyPubKey: string,
): Promise<EngagementKey | null> {
  const result = await db
    .select()
    .from(TableEngagementKey)
    .where(
      and(
        eq(TableEngagementKey.vaultId, vaultId),
        eq(TableEngagementKey.counterpartyAddress, counterpartyAddress),
        eq(TableEngagementKey.counterpartyPubKey, counterpartyPubKey),
        eq(TableEngagementKey.purpose, "receive"),
      ),
    )
    .limit(1);

  const row = result[0];
  if (!row) return null;

  return rowToEngagementKey(row);
}

/**
 * Get an engagement key by its ID
 *
 * @param id - The engagement key ID (ULID)
 * @returns The engagement key if found, null otherwise
 */
export async function getEngagementKeyById(
  id: string,
): Promise<EngagementKey | null> {
  const result = await db
    .select()
    .from(TableEngagementKey)
    .where(eq(TableEngagementKey.id, id))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  return rowToEngagementKey(row);
}

/**
 * Parameters for creating an engagement key
 */
export interface CreateEngagementKeyParams {
  id: string;
  vaultId: string;
  dbEntropy: string;
  dbEntropyHash: string;
  serverEntropyIndex: number;
  derivationPubKey: string;
  engagementPubKey: string;
  engagementPubKeyHash: string;
  purpose: EngagementKeyPurpose;
  counterpartyAddress: string | null;
  counterpartyPubKey: string | null;
  vaultGeneration?: number; // defaults to 1 in database
}

/**
 * Create a new engagement key
 *
 * Used by create-engagement-key, get-engagement-key-for-sending,
 * and get-counterparty-engagement-key procedures.
 *
 * @param params - The engagement key parameters
 * @returns The created engagement key
 */
export async function createEngagementKey(
  params: CreateEngagementKeyParams,
): Promise<EngagementKey> {
  await db.insert(TableEngagementKey).values({
    id: params.id,
    vaultId: params.vaultId,
    dbEntropy: params.dbEntropy,
    dbEntropyHash: params.dbEntropyHash,
    serverEntropyIndex: params.serverEntropyIndex,
    derivationPubKey: params.derivationPubKey,
    engagementPubKey: params.engagementPubKey,
    engagementPubKeyHash: params.engagementPubKeyHash,
    purpose: params.purpose,
    counterpartyAddress: params.counterpartyAddress,
    counterpartyPubKey: params.counterpartyPubKey,
    // Only include vaultGeneration if provided, otherwise use DB default (1)
    ...(params.vaultGeneration !== undefined && {
      vaultGeneration: params.vaultGeneration,
    }),
  });

  const created = await getEngagementKeyById(params.id);
  if (!created) {
    throw new Error("Failed to create engagement key");
  }

  return created;
}
