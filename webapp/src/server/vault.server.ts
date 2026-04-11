import { db } from "~/db";
import { secrets, secretVersions } from "~/db/schema";
import { eq, and, desc, lt, or, like, max } from "drizzle-orm";
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
  const secretId = newId();
  const versionId = newId();

  await db.transaction(async (tx) => {
    await tx.insert(secretVersions).values({
      id: versionId,
      secretId,
      version: 1,
      publicKey,
      encryptedData,
    });
    await tx.insert(secrets).values({
      id: secretId,
      userId,
      name,
      type,
      searchTerms,
      sourceMessageId: sourceMessageId ?? null,
      sourceAddress: sourceAddress ?? null,
      latestVersionId: versionId,
    });
  });

  return { id: versionId, secretId };
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
    .select({ maxVersion: max(secretVersions.version) })
    .from(secretVersions)
    .where(eq(secretVersions.secretId, secretId));
  const nextVersion = (maxRow?.maxVersion ?? 0) + 1;
  const versionId = newId();

  await db.transaction(async (tx) => {
    await tx.insert(secretVersions).values({
      id: versionId,
      secretId,
      version: nextVersion,
      publicKey,
      encryptedData,
    });
    await tx
      .update(secrets)
      .set({
        name,
        type,
        searchTerms,
        latestVersionId: versionId,
        updatedAt: new Date(),
      })
      .where(and(eq(secrets.id, secretId), eq(secrets.userId, userId)));
  });

  return versionId;
}

export async function getVaultEntries(
  userId: string,
  query?: string,
  beforeId?: string,
  limit = 20,
) {
  const conditions = [eq(secrets.userId, userId)];

  if (query) {
    const pattern = `%${query}%`;
    conditions.push(
      or(
        like(secrets.name, pattern),
        like(secrets.searchTerms, pattern),
      )!,
    );
  }

  if (beforeId) {
    conditions.push(lt(secrets.id, beforeId));
  }

  return db
    .select({
      id: secrets.id,
      name: secrets.name,
      type: secrets.type,
      searchTerms: secrets.searchTerms,
      publicKey: secretVersions.publicKey,
      encryptedData: secretVersions.encryptedData,
      createdAt: secrets.updatedAt,
      versionId: secretVersions.id,
    })
    .from(secrets)
    .innerJoin(
      secretVersions,
      eq(secrets.latestVersionId, secretVersions.id),
    )
    .where(and(...conditions))
    .orderBy(desc(secrets.updatedAt), desc(secrets.id))
    .limit(limit);
}

export async function getVaultEntry(userId: string, versionId: string) {
  const [row] = await db
    .select({
      id: secrets.id,
      name: secrets.name,
      type: secrets.type,
      searchTerms: secrets.searchTerms,
      sourceMessageId: secrets.sourceMessageId,
      sourceAddress: secrets.sourceAddress,
      latestVersionId: secrets.latestVersionId,
      createdAt: secrets.createdAt,
      updatedAt: secrets.updatedAt,
      versionId: secretVersions.id,
      version: secretVersions.version,
      publicKey: secretVersions.publicKey,
      encryptedData: secretVersions.encryptedData,
      versionCreatedAt: secretVersions.createdAt,
    })
    .from(secretVersions)
    .innerJoin(secrets, eq(secretVersions.secretId, secrets.id))
    .where(
      and(
        eq(secretVersions.id, versionId),
        eq(secrets.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function deleteVersion(userId: string, versionId: string) {
  // Find the secret and version
  const [row] = await db
    .select({
      secretId: secretVersions.secretId,
      version: secretVersions.version,
    })
    .from(secretVersions)
    .innerJoin(secrets, eq(secretVersions.secretId, secrets.id))
    .where(
      and(eq(secretVersions.id, versionId), eq(secrets.userId, userId)),
    )
    .limit(1);
  if (!row) return;

  await db.transaction(async (tx) => {
    await tx
      .delete(secretVersions)
      .where(eq(secretVersions.id, versionId));

    // Check if any versions remain
    const [remaining] = await tx
      .select({ id: secretVersions.id, version: secretVersions.version })
      .from(secretVersions)
      .where(eq(secretVersions.secretId, row.secretId))
      .orderBy(desc(secretVersions.version))
      .limit(1);

    if (!remaining) {
      // No versions left — delete the secret
      await tx.delete(secrets).where(eq(secrets.id, row.secretId));
    } else {
      // Update latestVersionId to the new latest
      await tx
        .update(secrets)
        .set({ latestVersionId: remaining.id, updatedAt: new Date() })
        .where(eq(secrets.id, row.secretId));
    }
  });
}

export async function deleteSecret(userId: string, secretId: string) {
  await db.transaction(async (tx) => {
    await tx
      .delete(secretVersions)
      .where(eq(secretVersions.secretId, secretId));
    await tx
      .delete(secrets)
      .where(and(eq(secrets.id, secretId), eq(secrets.userId, userId)));
  });
}

export async function getSecretHistory(userId: string, secretId: string) {
  return db
    .select({
      id: secretVersions.id,
      version: secretVersions.version,
      publicKey: secretVersions.publicKey,
      encryptedData: secretVersions.encryptedData,
      createdAt: secretVersions.createdAt,
    })
    .from(secretVersions)
    .innerJoin(secrets, eq(secretVersions.secretId, secrets.id))
    .where(
      and(eq(secretVersions.secretId, secretId), eq(secrets.userId, userId)),
    )
    .orderBy(desc(secretVersions.version));
}
