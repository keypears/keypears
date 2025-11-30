import { acb3Decrypt, acb3Encrypt } from "@webbuf/acb3";
import { blake3Hash, blake3Mac } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { publicKeyCreate } from "@webbuf/secp256k1";
import { WebBuf } from "@webbuf/webbuf";
import { z } from "zod";

export { blake3Hash, blake3Mac, acb3Encrypt, acb3Decrypt, FixedBuf, WebBuf };

// Re-export publicKeyCreate for deriving public keys from private keys
// This is used to derive vault public keys from vault private keys
export { publicKeyCreate };

// Export domain configuration
export {
  OFFICIAL_DOMAINS,
  DEV_PORT_MAP,
  getOfficialDomains,
  isOfficialDomain,
  getDevPort,
  buildServerUrl,
} from "./domains.js";

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
  id: z.string(), // ULID of this update
  secretId: z.string(), // ULID of the secret being updated
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
 * Derives the password key from the user's master password and vault ID
 *
 * This is the first key in the three-tier key hierarchy. The password key is:
 * - Stored on device encrypted with a PIN for quick unlock
 * - Used as input to derive both the encryption key and login key
 * - Never sent to the server or used directly for encryption
 * - Vault-specific: same password + different vault ID → different password key
 *
 * Two-step derivation process:
 * 1. Blake3 MAC with vault ID as context (prevents rainbow table attacks)
 * 2. Blake3 PBKDF with password salt (100k rounds for computational cost)
 *
 * Security properties:
 * - Malicious server cannot build rainbow table without knowing vault ID
 * - Same password across vaults → different password keys
 * - Complements server-side vault ID salting
 *
 * @param password - The user's master password
 * @param vaultId - The vault ID (ULID) to derive keys for
 * @returns A 32-byte password key unique to this vault
 */
export function derivePasswordKey(
  password: string,
  vaultId: string,
): FixedBuf<32> {
  // Step 1: Apply vault-specific MAC (prevents rainbow table attacks)
  const vaultIdKey = blake3Hash(WebBuf.fromUtf8(vaultId));
  const passwordBuf = WebBuf.fromUtf8(password);
  const vaultSpecificPassword = blake3Mac(vaultIdKey, passwordBuf);

  // Step 2: Derive password key with 100k rounds PBKDF
  const salt = derivePasswordSalt(password);
  return blake3Pbkdf(vaultSpecificPassword.buf, salt, 100_000);
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
 * Generate a deterministic salt for deriving the hashed login key on the server
 * This is used server-side only to hash the login key before storing in database
 */
export function deriveServerHashedLoginKeySalt(): FixedBuf<32> {
  return blake3Hash(WebBuf.fromUtf8("KeyPears server login salt v1"));
}

/**
 * Derives the hashed login key from the login key (SERVER-SIDE ONLY)
 *
 * This function is called on the server after receiving the login key from the client.
 * The server stores this hashed login key in the database. If the database is compromised,
 * an attacker cannot use the stolen hashed login key to authenticate because they would
 * need to reverse 1,000 rounds of KDF.
 *
 * Two-step derivation process:
 * 1. Blake3 MAC with vault ID as context (prevents password reuse detection)
 * 2. Blake3 PBKDF with server login salt (1k rounds for computational cost)
 *
 * Security properties:
 * - Vault ID salting prevents password reuse detection across vaults
 * - Same password + different vault ID → different hashed login key
 * - Complements client-side vault ID salting
 * - Reduces server CPU load vs 100k rounds (client already did heavy lifting)
 * - Prevents DOS attacks via fake login attempts
 * - Attacker needs to reverse 1k + 100k rounds total to get password key
 *
 * @param loginKey - The 32-byte login key received from the client (unhashed)
 * @param vaultId - The vault ID (ULID) to salt the login key for
 * @returns A 32-byte hashed login key for database storage
 */
export function deriveHashedLoginKey(
  loginKey: FixedBuf<32>,
  vaultId: string,
): FixedBuf<32> {
  // Step 1: Apply vault-specific MAC (prevents password reuse detection)
  const vaultIdKey = blake3Hash(WebBuf.fromUtf8(vaultId));
  const saltedLoginKey = blake3Mac(vaultIdKey, loginKey.buf);

  // Step 2: Derive hashed login key with 1k rounds PBKDF
  const salt = deriveServerHashedLoginKeySalt();
  return blake3Pbkdf(saltedLoginKey.buf, salt, 1_000);
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
 * Encrypts a password string with the vault key
 *
 * Takes a plaintext password and encrypts it using ACB3 (AES-256-CBC + Blake3-MAC).
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
  const encrypted = acb3Encrypt(passwordBuf, vaultKey);
  return encrypted.toHex();
}

/**
 * Decrypts an encrypted password string with the vault key
 *
 * Takes a hex-encoded encrypted password and decrypts it using ACB3
 * (AES-256-CBC + Blake3-MAC), returning the plaintext password.
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
  const decrypted = acb3Decrypt(encrypted, vaultKey);
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
