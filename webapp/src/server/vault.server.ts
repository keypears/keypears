import { db } from "~/db";
import { vaultEntries } from "~/db/schema";
import { eq, and, desc, lt, or, like, max, sql } from "drizzle-orm";
import { newId } from "./utils";

export async function createVaultEntry(
  userId: string,
  name: string,
  type: string,
  searchTerms: string,
  publicKey: string,
  encryptedData: string,
  sourceMessageId?: string,
  sourceAddress?: string,
): Promise<{ id: string; secretId: string }> {
  const id = newId();
  const secretId = newId();
  await db.insert(vaultEntries).values({
    id,
    userId,
    secretId,
    version: 1,
    name,
    type,
    searchTerms,
    publicKey,
    encryptedData,
    sourceMessageId: sourceMessageId ?? null,
    sourceAddress: sourceAddress ?? null,
  });
  return { id, secretId };
}

export async function createNewVersion(
  userId: string,
  secretId: string,
  name: string,
  type: string,
  searchTerms: string,
  publicKey: string,
  encryptedData: string,
): Promise<string> {
  const [maxRow] = await db
    .select({ maxVersion: max(vaultEntries.version) })
    .from(vaultEntries)
    .where(
      and(
        eq(vaultEntries.userId, userId),
        eq(vaultEntries.secretId, secretId),
      ),
    );
  const nextVersion = (maxRow?.maxVersion ?? 0) + 1;
  const id = newId();
  await db.insert(vaultEntries).values({
    id,
    userId,
    secretId,
    version: nextVersion,
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
  // Subquery: latest version per secret
  const latest = db
    .select({
      secretId: vaultEntries.secretId,
      maxVersion: max(vaultEntries.version).as("max_version"),
    })
    .from(vaultEntries)
    .where(eq(vaultEntries.userId, userId))
    .groupBy(vaultEntries.secretId)
    .as("latest");

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
      secretId: vaultEntries.secretId,
      version: vaultEntries.version,
      name: vaultEntries.name,
      type: vaultEntries.type,
      searchTerms: vaultEntries.searchTerms,
      publicKey: vaultEntries.publicKey,
      encryptedData: vaultEntries.encryptedData,
      createdAt: vaultEntries.createdAt,
    })
    .from(vaultEntries)
    .innerJoin(
      latest,
      and(
        eq(vaultEntries.secretId, latest.secretId),
        eq(vaultEntries.version, sql`${latest.maxVersion}`),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(vaultEntries.createdAt), desc(vaultEntries.id))
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

export async function deleteVaultEntry(userId: string, entryId: string) {
  await db
    .delete(vaultEntries)
    .where(and(eq(vaultEntries.id, entryId), eq(vaultEntries.userId, userId)));
}

export async function deleteSecret(userId: string, secretId: string) {
  await db
    .delete(vaultEntries)
    .where(
      and(
        eq(vaultEntries.userId, userId),
        eq(vaultEntries.secretId, secretId),
      ),
    );
}

export async function getSecretHistory(userId: string, secretId: string) {
  return db
    .select({
      id: vaultEntries.id,
      version: vaultEntries.version,
      name: vaultEntries.name,
      type: vaultEntries.type,
      searchTerms: vaultEntries.searchTerms,
      publicKey: vaultEntries.publicKey,
      encryptedData: vaultEntries.encryptedData,
      createdAt: vaultEntries.createdAt,
    })
    .from(vaultEntries)
    .where(
      and(
        eq(vaultEntries.userId, userId),
        eq(vaultEntries.secretId, secretId),
      ),
    )
    .orderBy(desc(vaultEntries.version));
}
