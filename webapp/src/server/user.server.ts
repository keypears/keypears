import { db, pool } from "~/db";
import { users, keys, powLog } from "~/db/schema";
import { eq, desc } from "drizzle-orm";
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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id FROM users
       WHERE expires_at < NOW() AND password_hash IS NULL
       ORDER BY id ASC LIMIT 1 FOR UPDATE`,
    );

    let id: number;

    if (Array.isArray(rows) && rows.length > 0) {
      id = (rows[0] as any).id;
      await conn.query(
        `UPDATE users SET created_at = ?, expires_at = ?, password_hash = NULL WHERE id = ?`,
        [now, expiresAt, id],
      );
    } else {
      const [result] = await conn.query(
        `INSERT INTO users (created_at, expires_at) VALUES (?, ?)`,
        [now, expiresAt],
      );
      id = (result as any).insertId;
    }

    await conn.commit();
    return { id };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getUserById(id: number) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function deleteUnsavedUser(id: number) {
  const user = await getUserById(id);
  if (!user) throw new Error("User not found");
  if (user.passwordHash) throw new Error("Cannot delete a saved account");
  // Set expires_at to the past so the row is immediately recyclable
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
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [countRows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM user_keys WHERE user_id = ?`,
      [userId],
    );
    const count =
      Array.isArray(countRows) && countRows.length > 0
        ? (countRows[0] as any).cnt
        : 0;
    if (count >= MAX_KEYS_PER_USER) {
      throw new Error(
        `Maximum of ${MAX_KEYS_PER_USER} keys reached. Create a new account to continue.`,
      );
    }

    const [rows] = await conn.query(
      `SELECT MAX(key_number) AS max_num FROM user_keys WHERE user_id = ? FOR UPDATE`,
      [userId],
    );
    const maxNum =
      Array.isArray(rows) && rows.length > 0
        ? ((rows[0] as any).max_num ?? 0)
        : 0;
    const keyNumber = maxNum + 1;

    await conn.query(
      `INSERT INTO user_keys (user_id, key_number, public_key, encrypted_private_key, created_at) VALUES (?, ?, ?, ?, NOW())`,
      [userId, keyNumber, publicKey, encryptedPrivateKey],
    );

    await conn.commit();
    return { keyNumber };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [
      newPasswordHash,
      userId,
    ]);

    for (const key of reEncryptedKeys) {
      await conn.query(
        `UPDATE user_keys SET encrypted_private_key = ? WHERE id = ? AND user_id = ?`,
        [key.encryptedPrivateKey, key.id, userId],
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT cumulative_difficulty FROM pow_log
       WHERE user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [userId],
    );

    const prev =
      Array.isArray(rows) && rows.length > 0
        ? BigInt((rows[0] as any).cumulative_difficulty)
        : 0n;
    const cumulative = prev + difficulty;

    await conn.query(
      `INSERT INTO pow_log (user_id, algorithm, difficulty, cumulative_difficulty, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [userId, algorithm, difficulty.toString(), cumulative.toString()],
    );

    await conn.commit();
    return { cumulativeDifficulty: cumulative };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
