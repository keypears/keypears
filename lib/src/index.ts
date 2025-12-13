import { acs2Decrypt, acs2Encrypt } from "@webbuf/acs2";
import { sha256Hash, sha256Hmac } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import {
  publicKeyCreate,
  privateKeyAdd,
  publicKeyAdd,
} from "@webbuf/secp256k1";
import { WebBuf } from "@webbuf/webbuf";
import { z } from "zod";
import { v7 as uuidv7 } from "uuid";

// KDF round constants
// Client-side derivation uses 100k rounds for computational cost against brute force
const CLIENT_KDF_ROUNDS = 100_000;
// Server-side also uses 100k rounds for maximum security
const SERVER_KDF_ROUNDS = 100_000;

export { sha256Hash, sha256Hmac, acs2Encrypt, acs2Decrypt, FixedBuf, WebBuf };

// Re-export secp256k1 functions for key operations
// - publicKeyCreate: derive public key from private key
// - privateKeyAdd: add two private keys (mod curve order)
// - publicKeyAdd: add two public keys (elliptic curve point addition)
export { publicKeyCreate, privateKeyAdd, publicKeyAdd };

// Export domain configuration
export {
  OFFICIAL_DOMAINS,
  DEV_PORT_MAP,
  getOfficialDomains,
  isOfficialDomain,
  getDevPort,
  buildBaseUrl,
  buildServerUrl,
} from "./domains.js";

// Export keypears.json schema for server discovery
export { KeypearsJsonSchema, type KeypearsJson } from "./keypears-json.js";

/** for all lowercase letters, 8 chars is ~38 bits of entropy (development minimum) */
export const StandardPasswordSchema = z.string().lowercase().min(8).max(128);

/** Zod schema for vault name validation */
export const vaultNameSchema = z
  .string()
  .min(1, "Vault name must be at least 1 character")
  .max(30, "Vault name must be at most 30 characters")
  .regex(/^[a-z]/, "Vault name must start with a letter")
  .regex(/^[a-z0-9]+$/, "Vault name must contain only alphanumeric characters");

/**
 * Schema for a secret update (diff)
 * Supports multiple secret types: passwords, env vars, API keys, wallet keys, passkeys
 * Only the secret data itself is encrypted - metadata remains unencrypted for efficient searching
 */
export const SecretUpdateSchema = z.object({
  // Required fields
  id: z.string(), // ID of this update (26-char Base32)
  secretId: z.string(), // ID of the secret being updated (26-char Base32)
  name: z.string().min(1).max(255), // Display name (e.g., "GitHub Account")

  // Secret type
  type: z
    .enum(["password", "envvar", "apikey", "walletkey", "passkey"])
    .optional()
    .default("password"),

  // Organizational
  folders: z.array(z.string().max(255)).max(10).optional(), // Folder path: ["Work", "AWS", "Production"]
  tags: z.array(z.string().max(255)).max(20).optional(), // Tags for grouping: ["myapp-prod-env"]

  // Password-specific fields (primarily for type="password")
  domain: z.string().max(255).optional(), // Domain (e.g., "github.com")
  username: z.string().max(255).optional(), // Username for login
  email: z.email().max(255).optional(), // Email for login
  label: z.string().max(255).optional(), // Generic label

  // Encrypted data (used by all types)
  encryptedData: z.string().optional(), // The secret value itself (hex string)
  encryptedNotes: z.string().max(4096).optional(), // Private encrypted notes

  createdAt: z.number(), // Unix timestamp in milliseconds
  deleted: z.boolean().optional(), // Tombstone flag for soft delete
});

export type SecretUpdate = z.infer<typeof SecretUpdateSchema>;

/** Generates a new random 32-byte key for encrypting a secret file */
export function generateKey(): FixedBuf<32> {
  return FixedBuf.fromRandom(32);
}

/** Hashes a 32-byte key to produce a key suitable for encrypting secrets */
export function hashKey(key: FixedBuf<32>): FixedBuf<32> {
  return sha256Hash(key.buf);
}

/**
 * Password-Based Key Derivation Function using SHA-256 HMAC
 *
 * This is a PBKDF (Password-Based Key Derivation Function) similar to PBKDF2,
 * but using SHA-256 HMAC. It's called "sha256Pbkdf" to distinguish it from
 * standard PBKDF2 while clearly indicating it serves the same purpose:
 * deriving a cryptographic key from a password.
 *
 * The function performs iterative key stretching by repeatedly applying
 * HMAC-SHA256. This increases the computational cost of brute-force attacks
 * while remaining efficient for legitimate use (100,000 rounds completes in
 * milliseconds).
 *
 * Algorithm:
 * - Round 1: result = hmac_sha256(salt, password)
 * - Round N: result = hmac_sha256(salt, previous_result)
 *
 * @param password - The input password as a string or WebBuf
 * @param salt - A 32-byte salt as FixedBuf<32>
 * @param rounds - Number of iterations (default: 100,000)
 * @returns A derived 32-byte key as FixedBuf<32>
 */
export function sha256Pbkdf(
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

  // First round: HMAC(salt, password)
  let result = sha256Hmac(salt.buf, passwordBuf);

  // Subsequent rounds: HMAC(salt, previous_result)
  for (let i = 1; i < rounds; i++) {
    result = sha256Hmac(salt.buf, result.buf);
  }

  return result;
}

/**
 * Generate a deterministic but unique salt from password for deriving the password key
 */
export function derivePasswordSalt(password: string): FixedBuf<32> {
  const context = sha256Hash(WebBuf.fromUtf8("KeyPears password salt v1"));
  const passwordBuf = WebBuf.fromUtf8(password);
  return sha256Hmac(context.buf, passwordBuf);
}

/**
 * Generate a deterministic salt for deriving the encryption key from the password key
 */
export function deriveEncryptionSalt(): FixedBuf<32> {
  return sha256Hash(WebBuf.fromUtf8("KeyPears encryption salt v1"));
}

/**
 * Generate a deterministic salt for deriving the login key from the password key
 */
export function deriveLoginSalt(): FixedBuf<32> {
  return sha256Hash(WebBuf.fromUtf8("KeyPears login salt v1"));
}

/**
 * Derives the password key from the user's master password and vault ID
 *
 * This is the first key in the three-tier key hierarchy. The password key is:
 * - Stored on device encrypted with a PIN for quick unlock
 * - Used as input to derive both the encryption key and login key
 * - Never sent to the server or used directly for encryption
 * - Vault-specific: same password + different vault ID → different password key
 *
 * Two-step derivation process:
 * 1. SHA-256 HMAC with vault ID as context (prevents rainbow table attacks)
 * 2. SHA-256 PBKDF with password salt (100k rounds for computational cost)
 *
 * Security properties:
 * - Malicious server cannot build rainbow table without knowing vault ID
 * - Same password across vaults → different password keys
 * - Complements server-side vault ID salting
 *
 * @param password - The user's master password
 * @param vaultId - The vault ID (26-char Base32) to derive keys for
 * @returns A 32-byte password key unique to this vault
 */
export function derivePasswordKey(
  password: string,
  vaultId: string,
): FixedBuf<32> {
  // Step 1: Apply vault-specific HMAC (prevents rainbow table attacks)
  const vaultIdKey = sha256Hash(WebBuf.fromUtf8(vaultId));
  const passwordBuf = WebBuf.fromUtf8(password);
  const vaultSpecificPassword = sha256Hmac(vaultIdKey.buf, passwordBuf);

  // Step 2: Derive password key with PBKDF
  const salt = derivePasswordSalt(password);
  return sha256Pbkdf(vaultSpecificPassword.buf, salt, CLIENT_KDF_ROUNDS);
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
  return sha256Pbkdf(passwordKey.buf, salt, CLIENT_KDF_ROUNDS);
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
  return sha256Pbkdf(passwordKey.buf, salt, CLIENT_KDF_ROUNDS);
}

/**
 * Generate a deterministic salt for deriving the hashed login key on the server
 * This is used server-side only to hash the login key before storing in database
 */
export function deriveServerHashedLoginKeySalt(): FixedBuf<32> {
  return sha256Hash(WebBuf.fromUtf8("KeyPears server login salt v1"));
}

/**
 * Derives the hashed login key from the login key (SERVER-SIDE ONLY)
 *
 * This function is called on the server after receiving the login key from the client.
 * The server stores this hashed login key in the database. If the database is compromised,
 * an attacker cannot use the stolen hashed login key to authenticate because they would
 * need to reverse 100,000 rounds of KDF.
 *
 * Two-step derivation process:
 * 1. SHA-256 HMAC with vault ID as context (prevents password reuse detection)
 * 2. SHA-256 PBKDF with server login salt (100k rounds for computational cost)
 *
 * Security properties:
 * - Vault ID salting prevents password reuse detection across vaults
 * - Same password + different vault ID → different hashed login key
 * - Complements client-side vault ID salting
 * - 100k rounds matches client-side security for maximum protection
 * - Attacker needs to reverse 100k + 100k rounds total to get password key
 *
 * @param loginKey - The 32-byte login key received from the client (unhashed)
 * @param vaultId - The vault ID (26-char Base32) to salt the login key for
 * @returns A 32-byte hashed login key for database storage
 */
export function deriveHashedLoginKey(
  loginKey: FixedBuf<32>,
  vaultId: string,
): FixedBuf<32> {
  // Step 1: Apply vault-specific HMAC (prevents password reuse detection)
  const vaultIdKey = sha256Hash(WebBuf.fromUtf8(vaultId));
  const saltedLoginKey = sha256Hmac(vaultIdKey.buf, loginKey.buf);

  // Step 2: Derive hashed login key with PBKDF
  const salt = deriveServerHashedLoginKeySalt();
  return sha256Pbkdf(saltedLoginKey.buf, salt, SERVER_KDF_ROUNDS);
}

/**
 * Encrypts a key using another key
 *
 * Generic encryption function that encrypts one 32-byte key with another
 * 32-byte key using ACS2 (AES-256-CBC + SHA-256-HMAC).
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
  return acs2Encrypt(keyToEncrypt.buf, encryptionKey, iv);
}

/**
 * Decrypts a key using another key
 *
 * Generic decryption function that decrypts an encrypted key using a
 * 32-byte decryption key via ACS2 (AES-256-CBC + SHA-256-HMAC).
 *
 * @param encryptedKey - The encrypted key as WebBuf
 * @param decryptionKey - The 32-byte key used for decryption
 * @returns Decrypted 32-byte key
 */
export function decryptKey(
  encryptedKey: WebBuf,
  decryptionKey: FixedBuf<32>,
): FixedBuf<32> {
  const decrypted = acs2Decrypt(encryptedKey, decryptionKey);
  return FixedBuf.fromBuf(32, decrypted);
}

/**
 * Encrypts a password string with the vault key
 *
 * Takes a plaintext password and encrypts it using ACS2 (AES-256-CBC + SHA-256-HMAC).
 * Returns a hex-encoded string suitable for storage in the database.
 *
 * @param password - The plaintext password to encrypt
 * @param vaultKey - The 32-byte vault key used for encryption
 * @returns Hex-encoded encrypted password string
 */
export function encryptPassword(
  password: string,
  vaultKey: FixedBuf<32>,
): string {
  const passwordBuf = WebBuf.fromUtf8(password);
  const encrypted = acs2Encrypt(passwordBuf, vaultKey);
  return encrypted.toHex();
}

/**
 * Decrypts an encrypted password string with the vault key
 *
 * Takes a hex-encoded encrypted password and decrypts it using ACS2
 * (AES-256-CBC + SHA-256-HMAC), returning the plaintext password.
 *
 * @param encryptedPasswordHex - Hex-encoded encrypted password
 * @param vaultKey - The 32-byte vault key used for decryption
 * @returns Plaintext password string
 */
export function decryptPassword(
  encryptedPasswordHex: string,
  vaultKey: FixedBuf<32>,
): string {
  const encrypted = WebBuf.fromHex(encryptedPasswordHex);
  const decrypted = acs2Decrypt(encrypted, vaultKey);
  return decrypted.toUtf8();
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
      randomValue = FixedBuf.fromRandom(1).buf[0] as number;
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

/**
 * Derives a derivation private key from server entropy and DB entropy.
 *
 * This function is used in the key derivation system where the server generates
 * public keys for users while only the user can derive the corresponding private keys.
 *
 * The derivation private key is computed as: HMAC-SHA256(serverEntropy, dbEntropy)
 *
 * This key is then added to the vault private key to produce the final derived private key:
 *   derivedPrivKey = vaultPrivKey + derivationPrivKey (mod curve order)
 *
 * @param serverEntropy - 32-byte server-side entropy (from DERIVATION_ENTROPY_N env var)
 * @param dbEntropy - 32-byte random entropy stored in database per derived key
 * @returns 32-byte derivation private key
 */
export function deriveDerivationPrivKey(
  serverEntropy: FixedBuf<32>,
  dbEntropy: FixedBuf<32>,
): FixedBuf<32> {
  return sha256Hmac(serverEntropy.buf, dbEntropy.buf);
}

// ============================================================================
// ID Generation (UUIDv7 with Crockford Base32 encoding)
// ============================================================================

// Crockford Base32 alphabet (excludes I, L, O, U to avoid confusion)
const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// Lookup table for Base32 decoding (built once)
const CROCKFORD_DECODE: Record<string, number> = {};
for (let i = 0; i < CROCKFORD_BASE32.length; i++) {
  const char = CROCKFORD_BASE32[i] as string;
  CROCKFORD_DECODE[char] = i;
  CROCKFORD_DECODE[char.toLowerCase()] = i;
}
// Handle common substitutions per Crockford spec
CROCKFORD_DECODE["I"] = 1;
CROCKFORD_DECODE["i"] = 1;
CROCKFORD_DECODE["L"] = 1;
CROCKFORD_DECODE["l"] = 1;
CROCKFORD_DECODE["O"] = 0;
CROCKFORD_DECODE["o"] = 0;

/**
 * Generates a new UUIDv7 and returns it as a 26-character Crockford Base32 string.
 *
 * UUIDv7 provides time-ordered, collision-resistant IDs similar to ULID.
 * The Base32 encoding produces the same 26-character format as ULID for compatibility.
 *
 * @returns 26-character Crockford Base32 encoded ID
 */
export function generateId(): string {
  const uuid = uuidv7();
  return uuidToId(uuid);
}

/**
 * Converts a standard UUID string to a 26-character Crockford Base32 ID.
 *
 * @param uuid - Standard UUID format (e.g., "01234567-89ab-cdef-0123-456789abcdef")
 * @returns 26-character Crockford Base32 encoded string
 */
export function uuidToId(uuid: string): string {
  // Remove hyphens and convert to bytes
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }

  // Encode 128 bits (16 bytes) to Base32 (26 chars)
  // Process 5 bits at a time
  let result = "";
  let buffer = 0;
  let bitsInBuffer = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsInBuffer += 8;

    while (bitsInBuffer >= 5) {
      bitsInBuffer -= 5;
      const index = (buffer >> bitsInBuffer) & 0x1f;
      result += CROCKFORD_BASE32[index];
    }
  }

  // Handle remaining bits (128 % 5 = 3, so we have 3 bits left, padded to 5)
  if (bitsInBuffer > 0) {
    const index = (buffer << (5 - bitsInBuffer)) & 0x1f;
    result += CROCKFORD_BASE32[index];
  }

  return result;
}

/**
 * Converts a 26-character Crockford Base32 ID to standard UUID format.
 *
 * @param base32Id - 26-character Crockford Base32 encoded string
 * @returns Standard UUID format (e.g., "01234567-89ab-cdef-0123-456789abcdef")
 */
export function idToUuid(base32Id: string): string {
  // Decode Base32 to bytes
  let buffer = 0;
  let bitsInBuffer = 0;
  const bytes: number[] = [];

  for (const char of base32Id) {
    const value = CROCKFORD_DECODE[char];
    if (value === undefined) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }

    buffer = (buffer << 5) | value;
    bitsInBuffer += 5;

    while (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes.push((buffer >> bitsInBuffer) & 0xff);
    }
  }

  // Convert bytes to hex
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Format as UUID: 8-4-4-4-12
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
