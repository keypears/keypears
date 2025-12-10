import { eq, and } from "drizzle-orm";
import { db } from "../index.js";
import { TableVault, type SelectVault } from "../schema.js";

/**
 * Vault model interface
 * Represents a vault stored in the database
 */
export interface Vault {
  id: string;
  name: string;
  domain: string;
  vaultPubKeyHash: string;
  hashedLoginKey: string;
  encryptedVaultKey: string;
  lastSyncTimestamp: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Check if a vault name is available for a specific domain
 *
 * @param name - The vault name to check
 * @param domain - The domain to check against
 * @returns true if the name is available, false if taken
 */
export async function checkNameAvailability(
  name: string,
  domain: string,
): Promise<boolean> {
  const existing = await db
    .select()
    .from(TableVault)
    .where(and(eq(TableVault.name, name), eq(TableVault.domain, domain)))
    .limit(1);

  return existing.length === 0;
}

/**
 * Get a vault by its ID
 *
 * @param id - The vault ID (ULID)
 * @returns The vault if found, null otherwise
 */
export async function getVaultById(id: string): Promise<Vault | null> {
  const result = await db
    .select()
    .from(TableVault)
    .where(eq(TableVault.id, id))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Get a vault by name and domain
 *
 * @param name - The vault name
 * @param domain - The vault domain
 * @returns The vault if found, null otherwise
 */
export async function getVaultByNameAndDomain(
  name: string,
  domain: string,
): Promise<Vault | null> {
  const result = await db
    .select()
    .from(TableVault)
    .where(and(eq(TableVault.name, name), eq(TableVault.domain, domain)))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Create a new vault
 *
 * @param params - Vault creation parameters
 * @returns The newly created vault
 */
export async function createVault(params: {
  id: string;
  name: string;
  domain: string;
  vaultPubKeyHash: string;
  hashedLoginKey: string;
  encryptedVaultKey: string;
}): Promise<Vault> {
  const {
    id,
    name,
    domain,
    vaultPubKeyHash,
    hashedLoginKey,
    encryptedVaultKey,
  } = params;

  await db.insert(TableVault).values({
    id,
    name,
    domain,
    vaultPubKeyHash,
    hashedLoginKey,
    encryptedVaultKey,
  });

  const vault = await getVaultById(id);
  if (!vault) {
    throw new Error("Failed to create vault");
  }

  return vault;
}
