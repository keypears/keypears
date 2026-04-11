import { db } from "~/db";
import { vaultEntries } from "~/db/schema";
import { eq, and, desc, lt, or, like } from "drizzle-orm";
import { newId } from "./utils";

export async function createVaultEntry(
  userId: string,
  name: string,
  type: string,
  searchTerms: string,
  publicKey: string,
  encryptedData: string,
): Promise<string> {
  const id = newId();
  await db.insert(vaultEntries).values({
    id,
    userId,
    name,
    type,
    searchTerms,
    publicKey,
    encryptedData,
  });
  return id;
}

export async function getVaultEntries(
  userId: string,
  query?: string,
  beforeId?: string,
  limit = 20,
) {
  const conditions = [eq(vaultEntries.userId, userId)];

  if (query) {
    const pattern = `%${query}%`;
    conditions.push(
      or(
        like(vaultEntries.name, pattern),
        like(vaultEntries.searchTerms, pattern),
      )!,
    );
  }

  if (beforeId) {
    conditions.push(lt(vaultEntries.id, beforeId));
  }

  return db
    .select({
      id: vaultEntries.id,
      name: vaultEntries.name,
      type: vaultEntries.type,
      searchTerms: vaultEntries.searchTerms,
      publicKey: vaultEntries.publicKey,
      encryptedData: vaultEntries.encryptedData,
      createdAt: vaultEntries.createdAt,
      updatedAt: vaultEntries.updatedAt,
    })
    .from(vaultEntries)
    .where(and(...conditions))
    .orderBy(desc(vaultEntries.updatedAt), desc(vaultEntries.id))
    .limit(limit);
}

export async function getVaultEntry(userId: string, entryId: string) {
  const [row] = await db
    .select()
    .from(vaultEntries)
    .where(and(eq(vaultEntries.id, entryId), eq(vaultEntries.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function updateVaultEntry(
  userId: string,
  entryId: string,
  name: string,
  type: string,
  searchTerms: string,
  publicKey: string,
  encryptedData: string,
) {
  await db
    .update(vaultEntries)
    .set({ name, type, searchTerms, publicKey, encryptedData, updatedAt: new Date() })
    .where(and(eq(vaultEntries.id, entryId), eq(vaultEntries.userId, userId)));
}

export async function deleteVaultEntry(userId: string, entryId: string) {
  await db
    .delete(vaultEntries)
    .where(and(eq(vaultEntries.id, entryId), eq(vaultEntries.userId, userId)));
}
