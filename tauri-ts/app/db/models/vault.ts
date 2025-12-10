import { db } from "../index";
import { TableVault } from "../schema";
import { eq, count, and, desc } from "drizzle-orm";
import { vaultNameSchema } from "@keypears/lib";
import { createVaultSyncState } from "./vault-sync-state";

export interface Vault {
  id: string;
  name: string;
  domain: string;
  encryptedVaultKey: string;
  vaultPubKeyHash: string;
  deviceId: string;
  deviceDescription: string | null;
  lastSyncTimestamp: number | null;
  lastAccessedAt: number | null;
  createdAt: number;
}

export async function createVault(
  vaultId: string,
  name: string,
  domain: string,
  encryptedVaultKey: string,
  vaultPubKeyHash: string,
  deviceId: string,
  deviceDescription: string | null,
): Promise<Vault> {
  // Validate name with Zod schema
  vaultNameSchema.parse(name);

  const createdAt = Date.now();

  await db.insert(TableVault).values({
    id: vaultId, // Server-generated ULID
    name,
    domain,
    encryptedVaultKey,
    vaultPubKeyHash,
    deviceId,
    deviceDescription,
    createdAt,
  });

  // Initialize sync state for the new vault
  await createVaultSyncState(vaultId);

  // Fetch the newly created vault
  const vault = await getVault(vaultId);
  if (!vault) {
    throw new Error("Failed to create vault");
  }

  return vault;
}

export async function getVault(id: string): Promise<Vault | undefined> {
  const result = await db
    .select()
    .from(TableVault)
    .where(eq(TableVault.id, id));
  return result[0];
}

export async function getVaultByNameAndDomain(
  name: string,
  domain: string,
): Promise<Vault | undefined> {
  const result = await db
    .select()
    .from(TableVault)
    .where(and(eq(TableVault.name, name), eq(TableVault.domain, domain)));
  return result[0];
}

export async function getVaults(): Promise<Vault[]> {
  // Sort by lastAccessedAt descending (most recent first), with nulls last
  // Then by createdAt descending as a secondary sort for vaults never accessed
  return await db
    .select()
    .from(TableVault)
    .orderBy(
      desc(TableVault.lastAccessedAt),
      desc(TableVault.createdAt),
    );
}

export async function countVaults(): Promise<number> {
  const result = await db.select({ count: count() }).from(TableVault);
  return result[0]?.count ?? 0;
}

export async function deleteVault(id: string): Promise<void> {
  await db.delete(TableVault).where(eq(TableVault.id, id));
}

export async function updateVault(
  id: string,
  updates: Partial<{
    deviceId: string;
    deviceDescription: string | null;
    lastSyncTimestamp: number | null;
    lastAccessedAt: number | null;
  }>,
): Promise<void> {
  await db.update(TableVault).set(updates).where(eq(TableVault.id, id));
}

export async function updateVaultLastAccessed(id: string): Promise<void> {
  await db
    .update(TableVault)
    .set({ lastAccessedAt: Date.now() })
    .where(eq(TableVault.id, id));
}
