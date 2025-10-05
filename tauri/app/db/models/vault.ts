import { db } from "../index";
import { vaults } from "../schema";
import { eq, count } from "drizzle-orm";
import { vaultNameSchema } from "@keypears/lib";

export interface Vault {
  id: string;
  name: string;
}

export async function createVault(name: string): Promise<Vault> {
  // Validate name with Zod schema
  vaultNameSchema.parse(name);

  const result = await db.insert(vaults).values({ name }).returning();
  return result[0];
}

export async function getVault(id: string): Promise<Vault | undefined> {
  const result = await db.select().from(vaults).where(eq(vaults.id, id));
  return result[0];
}

export async function getVaultByName(
  name: string,
): Promise<Vault | undefined> {
  const result = await db.select().from(vaults).where(eq(vaults.name, name));
  return result[0];
}

export async function getVaults(): Promise<Vault[]> {
  return await db.select().from(vaults);
}

export async function countVaults(): Promise<number> {
  const result = await db.select({ count: count() }).from(vaults);
  return result[0]?.count ?? 0;
}

export async function deleteVault(id: string): Promise<void> {
  await db.delete(vaults).where(eq(vaults.id, id));
}
