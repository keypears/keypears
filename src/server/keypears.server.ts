import { db, pool } from "~/db";
import { keypears } from "~/db/schema";
import { eq } from "drizzle-orm";
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

export async function insertKeypear() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXPIRY_MS);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id FROM keypears
       WHERE expires_at < NOW() AND password_hash IS NULL
       ORDER BY id ASC LIMIT 1 FOR UPDATE`,
    );

    let id: number;

    if (Array.isArray(rows) && rows.length > 0) {
      id = (rows[0] as any).id;
      await conn.query(
        `UPDATE keypears SET created_at = ?, expires_at = ?, password_hash = NULL WHERE id = ?`,
        [now, expiresAt, id],
      );
    } else {
      const [result] = await conn.query(
        `INSERT INTO keypears (created_at, expires_at) VALUES (?, ?)`,
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

export async function getKeypearById(id: number) {
  const [row] = await db
    .select()
    .from(keypears)
    .where(eq(keypears.id, id))
    .limit(1);
  return row ?? null;
}

export async function saveKeypear(
  id: number,
  loginKeyHex: string,
  publicKey: string,
  encryptedPrivateKey: string,
) {
  const passwordHash = hashLoginKey(loginKeyHex);
  await db
    .update(keypears)
    .set({ passwordHash, publicKey, encryptedPrivateKey, expiresAt: null })
    .where(eq(keypears.id, id));
}

export async function verifyLogin(id: number, loginKeyHex: string) {
  const [saved] = await db
    .select()
    .from(keypears)
    .where(eq(keypears.id, id))
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
