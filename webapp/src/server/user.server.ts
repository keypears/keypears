import { db } from "~/db";
import { users, keys, powLog } from "~/db/schema";
import { eq, desc, and, lt, isNull, max, count, sql } from "drizzle-orm";
import { sha256Hash, sha256Hmac } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { timingSafeEqual } from "node:crypto";

const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const SERVER_KDF_ROUNDS = 100_000;

function sha256Pbkdf(
  password: WebBuf,
  salt: FixedBuf<32>,
  rounds: number,
): FixedBuf<32> {
  let result = sha256Hmac(salt.buf, password);
  for (let i = 1; i < rounds; i++) {
    result = sha256Hmac(salt.buf, result.buf);
  }
  return result;
}

function deriveServerSalt(): FixedBuf<32> {
  return sha256Hash(WebBuf.fromUtf8("Keypears server login salt v1"));
}

function hashLoginKey(loginKeyHex: string): string {
  const loginKeyBuf = WebBuf.fromHex(loginKeyHex);
  const salt = deriveServerSalt();
  const hashed = sha256Pbkdf(loginKeyBuf, salt, SERVER_KDF_ROUNDS);
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
      .orderBy(users.id)
      .limit(1)
      .for("update");

    if (expired) {
      await tx
        .update(users)
        .set({ createdAt: now, expiresAt, passwordHash: null })
        .where(eq(users.id, expired.id));
      return { id: expired.id };
    }

    const [result] = await tx
      .insert(users)
      .values({ createdAt: now, expiresAt })
      .$returningId();
    return { id: result.id };
  });
}

export async function getUserById(id: number) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function deleteUnsavedUser(id: number) {
  const user = await getUserById(id);
  if (!user) throw new Error("User not found");
  if (user.passwordHash) throw new Error("Cannot delete a saved account");
  await db
    .update(users)
    .set({ expiresAt: new Date(0) })
    .where(eq(users.id, id));
}

export async function getActiveKey(userId: number) {
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
  userId: number,
  publicKey: string,
  encryptedPrivateKey: string,
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

    await tx.insert(keys).values({
      userId,
      keyNumber,
      publicKey,
      encryptedPrivateKey,
    });

    return { keyNumber };
  });
}

export async function saveUser(
  id: number,
  loginKeyHex: string,
  publicKey: string,
  encryptedPrivateKey: string,
) {
  const passwordHash = hashLoginKey(loginKeyHex);
  await db
    .update(users)
    .set({ passwordHash, expiresAt: null })
    .where(eq(users.id, id));
  await insertKey(id, publicKey, encryptedPrivateKey);
}

export async function getRecentKeys(userId: number, limit = 10) {
  return db
    .select({
      keyNumber: keys.keyNumber,
      publicKey: keys.publicKey,
      createdAt: keys.createdAt,
    })
    .from(keys)
    .where(eq(keys.userId, userId))
    .orderBy(desc(keys.createdAt))
    .limit(limit);
}

export async function getAllEncryptedKeys(userId: number) {
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
  userId: number,
  newLoginKeyHex: string,
  reEncryptedKeys: { id: number; encryptedPrivateKey: string }[],
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
        .set({ encryptedPrivateKey: key.encryptedPrivateKey })
        .where(and(eq(keys.id, key.id), eq(keys.userId, userId)));
    }
  });
}

export async function verifyLogin(id: number, loginKeyHex: string) {
  const [saved] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

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

  return { id: saved.id };
}

export async function insertPowLog(
  userId: number,
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

    await tx.insert(powLog).values({
      userId,
      algorithm,
      difficulty,
      cumulativeDifficulty: cumulative,
    });

    return { cumulativeDifficulty: cumulative };
  });
}

export async function getUserPowTotal(userId: number): Promise<bigint> {
  const [row] = await db
    .select({ cumulativeDifficulty: powLog.cumulativeDifficulty })
    .from(powLog)
    .where(eq(powLog.userId, userId))
    .orderBy(desc(powLog.id))
    .limit(1);
  return row?.cumulativeDifficulty ?? 0n;
}
