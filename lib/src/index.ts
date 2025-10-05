import { acb3Decrypt, acb3Encrypt } from "@webbuf/acb3";
import { blake3Hash, blake3Mac } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { z } from "zod";

export { blake3Hash, blake3Mac, acb3Encrypt, acb3Decrypt, FixedBuf, WebBuf };

/** for all lowercase letters, 16 chars is ~75 bits of entropy */
export const StandardPasswordSchema = z.string().lowercase().min(16).max(128);

/** Zod schema for vault name validation */
export const vaultNameSchema = z
  .string()
  .min(3, "Vault name must be at least 3 characters")
  .max(20, "Vault name must be at most 20 characters")
  .regex(/^[a-z]/, "Vault name must start with a letter")
  .regex(/^[a-z0-9]+$/, "Vault name must contain only alphanumeric characters");

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

/**
 * Password-Based Key Derivation Function using Blake3
 *
 * This is a PBKDF (Password-Based Key Derivation Function) similar to PBKDF2,
 * but using Blake3's keyed MAC mode instead of HMAC-SHA. It's called "blake3Pbkdf"
 * to distinguish it from standard PBKDF2 while clearly indicating it serves the
 * same purpose: deriving a cryptographic key from a password.
 *
 * The function performs iterative key stretching by repeatedly applying Blake3's
 * MAC operation. This increases the computational cost of brute-force attacks
 * while remaining efficient for legitimate use (100,000 rounds completes in
 * milliseconds with Blake3's speed).
 *
 * Algorithm:
 * - Round 1: result = blake3_mac(salt, password)
 * - Round N: result = blake3_mac(salt, previous_result)
 *
 * @param password - The input password as a string or WebBuf
 * @param salt - A 32-byte salt as FixedBuf<32>
 * @param rounds - Number of iterations (default: 100,000)
 * @returns A derived 32-byte key as FixedBuf<32>
 */
export function blake3Pbkdf(
  password: string | WebBuf,
  salt: FixedBuf<32>,
  rounds: number = 100_000,
): FixedBuf<32> {
  if (rounds < 1) {
    throw new Error("Rounds must be at least 1");
  }

  // Convert password to WebBuf if it's a string
  const passwordBuf =
    typeof password === "string" ? WebBuf.fromUtf8(password) : password;

  // First round: MAC(salt, password)
  let result = blake3Mac(salt, passwordBuf);

  // Subsequent rounds: MAC(salt, previous_result)
  for (let i = 1; i < rounds; i++) {
    result = blake3Mac(salt, result.buf);
  }

  return result;
}

/**
 * Generate a deterministic but unique salt from password for deriving the password key
 */
export function derivePasswordSalt(password: string): FixedBuf<32> {
  const context = blake3Hash(WebBuf.fromUtf8("KeyPears password salt v1"));
  const passwordBuf = WebBuf.fromUtf8(password);
  return blake3Mac(context, passwordBuf);
}

/**
 * Generate a deterministic salt for deriving the encryption key from the password key
 */
export function deriveEncryptionSalt(): FixedBuf<32> {
  return blake3Hash(WebBuf.fromUtf8("KeyPears encryption salt v1"));
}

/**
 * Generate a deterministic salt for deriving the login key from the password key
 */
export function deriveLoginSalt(): FixedBuf<32> {
  return blake3Hash(WebBuf.fromUtf8("KeyPears login salt v1"));
}

/**
 * Derives the password key from the user's master password
 *
 * This is the first key in the three-tier key hierarchy. The password key is:
 * - Stored on device encrypted with a PIN for quick unlock
 * - Used as input to derive both the encryption key and login key
 * - Never sent to the server or used directly for encryption
 *
 * @param password - The user's master password
 * @returns A 32-byte password key
 */
export function derivePasswordKey(password: string): FixedBuf<32> {
  const salt = derivePasswordSalt(password);
  return blake3Pbkdf(password, salt, 100_000);
}

/**
 * Derives the encryption key from the password key
 *
 * This key is used to encrypt/decrypt the master vault key. It is derived from
 * the password key through another round of PBKDF to ensure that even if the
 * login key is compromised, the encryption key cannot be derived from it.
 *
 * @param passwordKey - The password key derived from the user's master password
 * @returns A 32-byte encryption key
 */
export function deriveEncryptionKey(passwordKey: FixedBuf<32>): FixedBuf<32> {
  const salt = deriveEncryptionSalt();
  return blake3Pbkdf(passwordKey.buf, salt, 100_000);
}

/**
 * Derives the login key from the password key
 *
 * This key is sent to the server for authentication. It is derived from the
 * password key through another round of PBKDF to ensure that even if the server
 * is compromised, the password key and encryption key cannot be derived from it.
 *
 * @param passwordKey - The password key derived from the user's master password
 * @returns A 32-byte login key
 */
export function deriveLoginKey(passwordKey: FixedBuf<32>): FixedBuf<32> {
  const salt = deriveLoginSalt();
  return blake3Pbkdf(passwordKey.buf, salt, 100_000);
}

/**
 * Encrypts a key using another key
 *
 * Generic encryption function that encrypts one 32-byte key with another
 * 32-byte key using ACB3 (AES-256-CBC + Blake3-MAC).
 *
 * @param keyToEncrypt - The 32-byte key to encrypt
 * @param encryptionKey - The 32-byte key used for encryption
 * @param iv - Optional 16-byte IV for deterministic encryption (testing only)
 * @returns Encrypted key as WebBuf
 */
export function encryptKey(
  keyToEncrypt: FixedBuf<32>,
  encryptionKey: FixedBuf<32>,
  iv?: FixedBuf<16>,
): WebBuf {
  return acb3Encrypt(keyToEncrypt.buf, encryptionKey, iv);
}

/**
 * Decrypts a key using another key
 *
 * Generic decryption function that decrypts an encrypted key using a
 * 32-byte decryption key via ACB3 (AES-256-CBC + Blake3-MAC).
 *
 * @param encryptedKey - The encrypted key as WebBuf
 * @param decryptionKey - The 32-byte key used for decryption
 * @returns Decrypted 32-byte key
 */
export function decryptKey(
  encryptedKey: WebBuf,
  decryptionKey: FixedBuf<32>,
): FixedBuf<32> {
  const decrypted = acb3Decrypt(encryptedKey, decryptionKey);
  return FixedBuf.fromBuf(32, decrypted);
}

/**
 * Options for generating a secure password
 */
export interface PasswordOptions {
  length: number; // minimum 16 recommended for 75+ bits of entropy
  lowercase?: boolean; // default: true
  uppercase?: boolean; // default: false
  numbers?: boolean; // default: false
  symbols?: boolean; // default: false
}

/**
 * Generates a cryptographically secure random password
 * Uses rejection sampling to avoid modulo bias
 *
 * Default is lowercase-only for mobile usability and memorability.
 * 16+ lowercase chars provides ~75 bits of entropy (log2(26^16) ≈ 75.4 bits)
 */
export function generateSecurePassword(options: PasswordOptions): string {
  const {
    length,
    lowercase = true,
    uppercase = false,
    numbers = false,
    symbols = false,
  } = options;

  if (length <= 0) {
    throw new Error("Password length must be greater than 0");
  }

  // Define character sets
  const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
  const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const NUMBERS = "0123456789";
  const SYMBOLS = "!@#$%^&*()-_=+[]{}|;:,.<>?";

  // Build charset from enabled options
  let charset = "";
  if (lowercase) charset += LOWERCASE;
  if (uppercase) charset += UPPERCASE;
  if (numbers) charset += NUMBERS;
  if (symbols) charset += SYMBOLS;

  if (charset.length === 0) {
    throw new Error("At least one character set must be enabled");
  }

  const charsetLength = charset.length;
  let password = "";

  for (let i = 0; i < length; i++) {
    let randomValue: number;

    // Rejection sampling to avoid modulo bias
    do {
      randomValue = WebBuf.fromUint8Array(
        crypto.getRandomValues(new Uint8Array(1)),
      )[0] as number;
    } while (randomValue >= Math.floor(256 / charsetLength) * charsetLength);

    password += charset[randomValue % charsetLength];
  }

  return password;
}

/**
 * Calculates the entropy (in bits) of a password given its length and character sets
 * Entropy = log2(charset_size^length) = length * log2(charset_size)
 *
 * @param length - Length of the password
 * @param options - Character set options (lowercase, uppercase, numbers, symbols)
 * @returns Entropy in bits
 */
export function calculatePasswordEntropy(
  length: number,
  options: {
    lowercase?: boolean;
    uppercase?: boolean;
    numbers?: boolean;
    symbols?: boolean;
  },
): number {
  const {
    lowercase = true,
    uppercase = false,
    numbers = false,
    symbols = false,
  } = options;

  // Define character set sizes
  const LOWERCASE_SIZE = 26;
  const UPPERCASE_SIZE = 26;
  const NUMBERS_SIZE = 10;
  const SYMBOLS_SIZE = 28;

  // Calculate total charset size
  let charsetSize = 0;
  if (lowercase) charsetSize += LOWERCASE_SIZE;
  if (uppercase) charsetSize += UPPERCASE_SIZE;
  if (numbers) charsetSize += NUMBERS_SIZE;
  if (symbols) charsetSize += SYMBOLS_SIZE;

  if (charsetSize === 0) {
    return 0; // No character sets enabled
  }

  // Entropy = length * log2(charset_size)
  return length * Math.log2(charsetSize);
}
