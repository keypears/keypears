import { db } from "~/db";
import { users, keys, powLog, sessions, domains } from "~/db/schema";
import { eq, desc, and, lt, isNull, max, count, sql, ne } from "drizzle-orm";
import { blake3Hash } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { timingSafeEqual } from "node:crypto";
import { blake3Pbkdf } from "~/lib/kdf";
import { getDomain } from "~/lib/config";
import { newId } from "./utils";

const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const SERVER_KDF_ROUNDS = 100_000;

// --- Domain management ---

export async function getDomainByName(domainName: string) {
  const [row] = await db
    .select()
    .from(domains)
    .where(eq(domains.domain, domainName))
    .limit(1);
  return row ?? null;
}

export async function getOrCreateDomain(
  domainName: string,
): Promise<{ id: string; domain: string }> {
  const existing = await getDomainByName(domainName);
  if (existing) return existing;

  const id = newId();
  await db.insert(domains).values({ id, domain: domainName });
  return { id, domain: domainName };
}

export async function isLocalDomain(domainName: string): Promise<boolean> {
  const row = await getDomainByName(domainName);
  return row != null;
}

export async function getDomainById(id: string) {
  const [row] = await db
    .select()
    .from(domains)
    .where(eq(domains.id, id))
    .limit(1);
  return row ?? null;
}

export async function getPrimaryDomain() {
  return getDomainByName(getDomain());
}

export async function toggleOpenRegistration(domainId: string, value: boolean) {
  await db
    .update(domains)
    .set({ openRegistration: value })
    .where(eq(domains.id, domainId));
}

export async function toggleAllowThirdPartyDomains(
  domainId: string,
  value: boolean,
) {
  await db
    .update(domains)
    .set({ allowThirdPartyDomains: value })
    .where(eq(domains.id, domainId));
}

export async function getDomainsForAdmin(userId: string) {
  return db
    .select({
      id: domains.id,
      domain: domains.domain,
      openRegistration: domains.openRegistration,
      allowThirdPartyDomains: domains.allowThirdPartyDomains,
    })
    .from(domains)
    .where(eq(domains.adminUserId, userId));
}

export async function getUsersForDomain(domainId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.domainId, domainId), sql`${users.passwordHash} IS NOT NULL`))
    .orderBy(users.name);
}

export async function claimDomain(
  domainName: string,
  adminUserId: string,
): Promise<{ id: string; domain: string }> {
  const existing = await getDomainByName(domainName);
  if (existing) {
    // Update admin if domain already exists
    await db
      .update(domains)
      .set({ adminUserId })
      .where(eq(domains.id, existing.id));
    return existing;
  }

  const id = newId();
  await db.insert(domains).values({ id, domain: domainName, adminUserId });
  return { id, domain: domainName };
}

export async function createUserForDomain(
  name: string,
  domainId: string,
  loginKeyHex: string,
  publicKey: string,
  encryptedPrivateKey: string,
) {
  // Check name uniqueness within domain
  const existing = await getUserByNameAndDomain(name, domainId);
  if (existing) throw new Error("Name is already taken");

  const passwordHash = hashLoginKey(loginKeyHex);
  const id = newId();
  await db.insert(users).values({
    id,
    name,
    domainId,
    passwordHash,
    expiresAt: null,
  });
  await insertKey(id, publicKey, encryptedPrivateKey, passwordHash);
  return { id };
}

export async function resetUserPassword(
  userId: string,
  newLoginKeyHex: string,
  publicKey: string,
  encryptedPrivateKey: string,
) {
  const newPasswordHash = hashLoginKey(newLoginKeyHex);
  await db
    .update(users)
    .set({ passwordHash: newPasswordHash })
    .where(eq(users.id, userId));
  await insertKey(userId, publicKey, encryptedPrivateKey, newPasswordHash);
  // Revoke all sessions for this user
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

function deriveServerSalt(): FixedBuf<32> {
  return blake3Hash(WebBuf.fromUtf8("Keypears server login salt v1"));
}

function hashLoginKey(loginKeyHex: string): string {
  const loginKeyBuf = WebBuf.fromHex(loginKeyHex);
  const salt = deriveServerSalt();
  const hashed = blake3Pbkdf(loginKeyBuf, salt, SERVER_KDF_ROUNDS);
  return hashed.buf.toHex();
}

export async function insertUser() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXPIRY_MS);

  return db.transaction(async (tx) => {
    // Find an expired, unsaved user to recycle
    const [expired] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(lt(users.expiresAt, sql`NOW()`), isNull(users.passwordHash)))
      .orderBy(users.createdAt)
      .limit(1)
      .for("update");

    if (expired) {
      await tx
        .update(users)
        .set({ createdAt: now, expiresAt, passwordHash: null, name: null })
        .where(eq(users.id, expired.id));
      return { id: expired.id };
    }

    const id = newId();
    await tx.insert(users).values({ id, createdAt: now, expiresAt });
    return { id };
  });
}

export async function getUserById(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function getUserByNameAndDomain(
  name: string,
  domainId: string,
) {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.name, name), eq(users.domainId, domainId)))
    .limit(1);
  return row ?? null;
}

export async function deleteUnsavedUser(id: string) {
  const user = await getUserById(id);
  if (!user) throw new Error("User not found");
  if (user.passwordHash) throw new Error("Cannot delete a saved account");
  await db
    .update(users)
    .set({ expiresAt: new Date(0) })
    .where(eq(users.id, id));
}

export async function getActiveKey(userId: string) {
  const [row] = await db
    .select()
    .from(keys)
    .where(eq(keys.userId, userId))
    .orderBy(desc(keys.createdAt))
    .limit(1);
  return row ?? null;
}

const MAX_KEYS_PER_USER = 100;

export async function insertKey(
  userId: string,
  publicKey: string,
  encryptedPrivateKey: string,
  loginKeyHash?: string,
) {
  return db.transaction(async (tx) => {
    const [countResult] = await tx
      .select({ cnt: count() })
      .from(keys)
      .where(eq(keys.userId, userId));
    if (countResult.cnt >= MAX_KEYS_PER_USER) {
      throw new Error(`Maximum of ${MAX_KEYS_PER_USER} keys reached.`);
    }

    const [maxResult] = await tx
      .select({ maxNum: max(keys.keyNumber) })
      .from(keys)
      .where(eq(keys.userId, userId))
      .for("update");
    const keyNumber = (maxResult.maxNum ?? 0) + 1;

    const id = newId();
    await tx.insert(keys).values({
      id,
      userId,
      keyNumber,
      publicKey,
      encryptedPrivateKey,
      loginKeyHash: loginKeyHash ?? null,
    });

    return { keyNumber };
  });
}

export async function saveUser(
  id: string,
  name: string,
  domainId: string,
  loginKeyHex: string,
  publicKey: string,
  encryptedPrivateKey: string,
) {
  // Check name uniqueness within domain
  const existing = await getUserByNameAndDomain(name, domainId);
  if (existing && existing.id !== id) {
    throw new Error("Name is already taken");
  }

  const passwordHash = hashLoginKey(loginKeyHex);
  await db
    .update(users)
    .set({ name, domainId, passwordHash, expiresAt: null })
    .where(eq(users.id, id));
  await insertKey(id, publicKey, encryptedPrivateKey, passwordHash);
}

export async function getRecentKeys(userId: string, limit = 10) {
  return db
    .select({
      id: keys.id,
      keyNumber: keys.keyNumber,
      publicKey: keys.publicKey,
      encryptedPrivateKey: keys.encryptedPrivateKey,
      loginKeyHash: keys.loginKeyHash,
      createdAt: keys.createdAt,
    })
    .from(keys)
    .where(eq(keys.userId, userId))
    .orderBy(desc(keys.createdAt))
    .limit(limit);
}

export async function getAllEncryptedKeys(userId: string) {
  return db
    .select({
      id: keys.id,
      keyNumber: keys.keyNumber,
      encryptedPrivateKey: keys.encryptedPrivateKey,
    })
    .from(keys)
    .where(eq(keys.userId, userId))
    .orderBy(keys.keyNumber);
}

export async function changePassword(
  userId: string,
  newLoginKeyHex: string,
  reEncryptedKeys: { id: string; encryptedPrivateKey: string }[],
) {
  const newPasswordHash = hashLoginKey(newLoginKeyHex);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash: newPasswordHash })
      .where(eq(users.id, userId));

    for (const key of reEncryptedKeys) {
      await tx
        .update(keys)
        .set({
          encryptedPrivateKey: key.encryptedPrivateKey,
          loginKeyHash: newPasswordHash,
        })
        .where(and(eq(keys.id, key.id), eq(keys.userId, userId)));
    }
  });
}

export async function reEncryptKey(
  userId: string,
  keyId: string,
  encryptedPrivateKey: string,
  loginKeyHex: string,
) {
  const loginKeyHash = hashLoginKey(loginKeyHex);
  const result = await db
    .update(keys)
    .set({ encryptedPrivateKey, loginKeyHash })
    .where(and(eq(keys.id, keyId), eq(keys.userId, userId)));
  if (result[0].affectedRows === 0) {
    throw new Error("Key not found");
  }
}

export async function verifyLogin(
  name: string,
  domainId: string,
  loginKeyHex: string,
) {
  const saved = await getUserByNameAndDomain(name, domainId);

  if (!saved || !saved.passwordHash) {
    throw new Error("Invalid credentials");
  }

  const inputHash = hashLoginKey(loginKeyHex);
  if (
    !timingSafeEqual(
      Buffer.from(saved.passwordHash, "hex"),
      Buffer.from(inputHash, "hex"),
    )
  ) {
    throw new Error("Invalid credentials");
  }

  return { id: saved.id, name: saved.name };
}

export async function insertPowLog(
  userId: string,
  algorithm: string,
  difficulty: bigint,
) {
  return db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ cumulativeDifficulty: powLog.cumulativeDifficulty })
      .from(powLog)
      .where(eq(powLog.userId, userId))
      .orderBy(desc(powLog.id))
      .limit(1)
      .for("update");

    const cumulative = (prev?.cumulativeDifficulty ?? 0n) + difficulty;

    const id = newId();
    await tx.insert(powLog).values({
      id,
      userId,
      algorithm,
      difficulty,
      cumulativeDifficulty: cumulative,
    });

    return { cumulativeDifficulty: cumulative };
  });
}

export async function getUserPowTotal(userId: string): Promise<bigint> {
  const [row] = await db
    .select({ cumulativeDifficulty: powLog.cumulativeDifficulty })
    .from(powLog)
    .where(eq(powLog.userId, userId))
    .orderBy(desc(powLog.id))
    .limit(1);
  return row?.cumulativeDifficulty ?? 0n;
}

// --- PoW settings ---

export async function updatePowSettings(
  userId: string,
  channelDifficulty: bigint,
  messageDifficulty: bigint,
) {
  const {
    MIN_CHANNEL_DIFFICULTY,
    MIN_MESSAGE_DIFFICULTY,
  } = await import("./pow.server");

  if (channelDifficulty < MIN_CHANNEL_DIFFICULTY) {
    throw new Error(
      `Channel difficulty must be at least ${MIN_CHANNEL_DIFFICULTY}`,
    );
  }
  if (messageDifficulty < MIN_MESSAGE_DIFFICULTY) {
    throw new Error(
      `Message difficulty must be at least ${MIN_MESSAGE_DIFFICULTY}`,
    );
  }

  await db
    .update(users)
    .set({ channelDifficulty, messageDifficulty })
    .where(eq(users.id, userId));
}

export async function getUserPowSettings(userId: string) {
  const [row] = await db
    .select({
      channelDifficulty: users.channelDifficulty,
      messageDifficulty: users.messageDifficulty,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

// --- Session management ---

function hashSessionToken(token: string): string {
  return blake3Hash(WebBuf.fromHex(token)).buf.toHex();
}

export async function createSession(
  userId: string,
  maxAgeSeconds: number,
): Promise<{ token: string; tokenHash: string }> {
  const token = FixedBuf.fromRandom(32).buf.toHex();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

  await db.insert(sessions).values({ tokenHash, userId, expiresAt });

  // Lazy cleanup: delete expired sessions
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  return { token, tokenHash };
}

export async function resolveSession(
  token: string,
): Promise<string | null> {
  const tokenHash = hashSessionToken(token);
  const [row] = await db
    .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }
  return row.userId;
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteAllSessionsExcept(
  userId: string,
  currentTokenHash: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(
      and(eq(sessions.userId, userId), ne(sessions.tokenHash, currentTokenHash)),
    );
}
