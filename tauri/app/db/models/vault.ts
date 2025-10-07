import { db } from "../index";
import { TableVaults } from "../schema";
import { eq, count } from "drizzle-orm";
import { vaultNameSchema } from "@keypears/lib";

export interface Vault {
  id: string;
  name: string;
  encryptedVaultKey: string;
  hashedVaultKey: string;
  createdAt: number;
}

export async function createVault(
  name: string,
  encryptedVaultKey: string,
  hashedVaultKey: string,
): Promise<Vault> {
  // Validate name with Zod schema
  vaultNameSchema.parse(name);

  const createdAt = Date.now();

  await db.insert(TableVaults).values({
    name,
    encryptedVaultKey,
    hashedVaultKey,
    createdAt,
  });

  // Fetch the newly created vault
  const vault = await getVaultByName(name);
  if (!vault) {
    throw new Error("Failed to create vault");
  }

  return vault;
}

export async function getVault(id: string): Promise<Vault | undefined> {
  const result = await db
    .select()
    .from(TableVaults)
    .where(eq(TableVaults.id, id));
  return result[0];
}

export async function getVaultByName(name: string): Promise<Vault | undefined> {
  const result = await db
    .select()
    .from(TableVaults)
    .where(eq(TableVaults.name, name));
  return result[0];
}

export async function getVaults(): Promise<Vault[]> {
  return await db.select().from(TableVaults);
}

export async function countVaults(): Promise<number> {
  const result = await db.select({ count: count() }).from(TableVaults);
  return result[0]?.count ?? 0;
}

export async function deleteVault(id: string): Promise<void> {
  await db.delete(TableVaults).where(eq(TableVaults.id, id));
}
