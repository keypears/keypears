import { acb3Decrypt, acb3Encrypt } from "@webbuf/acb3";
import { blake3Hash, blake3Mac } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { z } from "zod";

/** for all lowercase letters, 16 chars is ~75 bits of entropy */
export const StandardPasswordSchema = z.string().lowercase().min(16).max(128);

/**
 * the schema for an update to a secret
 */
export const SecretUpdateSchema = z.object({
  id: z.ulid(), // id of this update
  secretId: z.ulid(), // id of the secret being updated
  name: z.string().min(1).max(255),
  domain: z.string().optional(),
  label: z.string().optional(),
  secretType: z.enum(["password", "env-var", "api-key", "cryptocurrency-key"]),
  encryptedSecret: z.string().optional(), // encrypted secret data
  createdAt: z.iso.datetime(),
  deleted: z.boolean().optional(), // soft delete for sync purposes
});

/** Generates a new random 32-byte key for encrypting a secret file */
export function generateKey(): FixedBuf<32> {
  return FixedBuf.fromRandom(32);
}

/** Hashes a 32-byte key to produce a key suitable for encrypting secrets */
export function hashKey(key: FixedBuf<32>): FixedBuf<32> {
  return blake3Hash(key.buf);
}

/** Derives a key from a password, salt, and number of rounds using Blake3-based KDF
 * This is a custom KDF using Blake3's keyed mode for HMAC-like functionality
 * Note: This is not a standard KDF like PBKDF2 or Argon2, but is designed to be secure
 * and fast while leveraging Blake3's performance and security properties.
 *
 * @param password - The input password as a string
 * @param salt - A 32-byte salt as FixedBuf<32>
 * @param rounds - Number of iterations (default: 100,000)
 * @returns A derived 32-byte key as FixedBuf<32>
 */
export function derivePasswordKeyTemplate(
  password: string,
  salt: FixedBuf<32>,
  rounds: number = 100_000,
): FixedBuf<32> {
  if (rounds < 1) {
    throw new Error("Rounds must be at least 1");
  }

  // Convert password to WebBuf
  const passwordBuf = WebBuf.fromUtf8(password);

  // First round: MAC(salt, password)
  let result = blake3Mac(salt, passwordBuf);

  // Subsequent rounds: MAC(salt, previous_result)
  for (let i = 1; i < rounds; i++) {
    result = blake3Mac(salt, result.buf);
  }

  return result;
}

/**
 * Generate a deterministic but unique salt from password
 */
export function derivePasswordSalt(password: string): FixedBuf<32> {
  const context = blake3Hash(WebBuf.fromUtf8("KeyPears password salt v1"));
  const passwordBuf = WebBuf.fromUtf8(password);
  return blake3Mac(context, passwordBuf);
}

/**
 * Derives a 32-byte key from the given password using a deterministic salt
 * and 100,000 rounds of Blake3-based key derivation
 */
export function derivePasswordKey(password: string): FixedBuf<32> {
  const salt = derivePasswordSalt(password);
  return derivePasswordKeyTemplate(password, salt, 100_000);
}

/** Encrypts a 32-byte key using a password-derived key
 * Optionally accepts an IV for deterministic encryption (for testing)
 */
export function encryptKey(
  password: string,
  key: FixedBuf<32>,
  iv?: FixedBuf<16>,
): WebBuf {
  const hashedPassword = derivePasswordKey(password);
  return acb3Encrypt(key.buf, hashedPassword, iv);
}

/** Decrypts a 32-byte key using a password-derived key */
export function decryptKey(
  password: string,
  encryptedKey: WebBuf,
): FixedBuf<32> {
  const hashedPassword = derivePasswordKey(password);
  const decrypted = acb3Decrypt(encryptedKey, hashedPassword);
  return FixedBuf.fromBuf(32, decrypted);
}

/**
 * Generates a cryptographically secure random password with lowercase letters
 * Uses rejection sampling to avoid modulo bias
 */
export function generateSecureLowercasePassword(length: number): string {
  if (length <= 0) {
    throw new Error("Password length must be greater than 0");
  }

  const charset = "abcdefghijklmnopqrstuvwxyz";

  const charsetLength = charset.length;
  let password = "";

  for (let i = 0; i < length; i++) {
    let randomValue: number;

    // Rejection sampling to avoid modulo bias
    do {
      // randomValue = crypto.randomBytes(1)[0] as number;
      randomValue = WebBuf.fromUint8Array(
        crypto.getRandomValues(new Uint8Array(1)),
      )[0] as number;
    } while (randomValue >= Math.floor(256 / charsetLength) * charsetLength);

    password += charset[randomValue % charsetLength];
  }

  return password;
}
