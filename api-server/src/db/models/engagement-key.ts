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
  isUsed: boolean;
  createdAt: Date;
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
    isUsed: row.isUsed,
    createdAt: row.createdAt,
  };
}

/**
 * Get an existing engagement key for sending to a counterparty
 * Used to find if we already have a "send" key for this counterparty
 *
 * @param vaultId - The vault ID
 * @param counterpartyAddress - The counterparty's address (e.g., "bob@example.com")
 * @returns The engagement key if found, null otherwise
 */
export async function getEngagementKeyForSending(
  vaultId: string,
  counterpartyAddress: string,
): Promise<EngagementKey | null> {
  const result = await db
    .select()
    .from(TableEngagementKey)
    .where(
      and(
        eq(TableEngagementKey.vaultId, vaultId),
        eq(TableEngagementKey.counterpartyAddress, counterpartyAddress),
        eq(TableEngagementKey.purpose, "send"),
      ),
    )
    .limit(1);

  const row = result[0];
  if (!row) return null;

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
    isUsed: row.isUsed,
    createdAt: row.createdAt,
  };
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
    isUsed: row.isUsed,
    createdAt: row.createdAt,
  };
}

/**
 * Mark an engagement key as used
 * Called after a message is successfully sent using this key
 *
 * @param id - The engagement key ID
 * @returns true if the key was updated, false if not found
 */
export async function markEngagementKeyAsUsed(id: string): Promise<boolean> {
  const result = await db
    .update(TableEngagementKey)
    .set({ isUsed: true })
    .where(eq(TableEngagementKey.id, id));

  return result.rowCount !== null && result.rowCount > 0;
}
