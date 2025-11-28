import { db } from "../index";
import { TableVault } from "../schema";
import { eq, count, and } from "drizzle-orm";
import { vaultNameSchema } from "@keypears/lib";
import { createVaultSyncState } from "./vault-sync-state";

export interface Vault {
  id: string;
  name: string;
  domain: string;
  encryptedVaultKey: string;
  vaultPubKeyHash: string;
  lastSyncTimestamp: number | null;
  createdAt: number;
}

export async function createVault(
  vaultId: string,
  name: string,
  domain: string,
  encryptedVaultKey: string,
  vaultPubKeyHash: string,
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
  return await db.select().from(TableVault);
}

export async function countVaults(): Promise<number> {
  const result = await db.select({ count: count() }).from(TableVault);
  return result[0]?.count ?? 0;
}

export async function deleteVault(id: string): Promise<void> {
  await db.delete(TableVault).where(eq(TableVault.id, id));
}
