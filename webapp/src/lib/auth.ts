import { sha256Hash, sha256Hmac } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { publicKeyCreate } from "@webbuf/secp256k1";
import { acs2Encrypt, acs2Decrypt } from "@webbuf/acs2";

const CLIENT_KDF_ROUNDS = 100_000;
const ENCRYPTION_KEY_STORAGE_KEY = "keypears_encryption_key";
const ENTROPY_TIER_STORAGE_KEY = "keypears_entropy_tier";

// --- Password entropy ---

const LOWERCASE_SIZE = 26;
const UPPERCASE_SIZE = 26;
const NUMBERS_SIZE = 10;
const SYMBOLS_SIZE = 28;

export type EntropyTier = "red" | "yellow" | "green";

export function calculatePasswordEntropy(password: string): number {
  if (password.length === 0) return 0;

  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += LOWERCASE_SIZE;
  if (/[A-Z]/.test(password)) charsetSize += UPPERCASE_SIZE;
  if (/[0-9]/.test(password)) charsetSize += NUMBERS_SIZE;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += SYMBOLS_SIZE;

  if (charsetSize === 0) return 0;
  return password.length * Math.log2(charsetSize);
}

export function entropyTier(entropy: number): EntropyTier {
  if (entropy < 50) return "red";
  if (entropy < 75) return "yellow";
  return "green";
}

export function entropyLabel(tier: EntropyTier): string {
  if (tier === "red") return "Weak";
  if (tier === "yellow") return "Fair";
  return "Strong";
}

export function entropyColor(tier: EntropyTier): string {
  if (tier === "red") return "text-destructive";
  if (tier === "yellow") return "text-yellow-500";
  return "text-green-500";
}

export function cacheEntropyTier(tier: EntropyTier): void {
  localStorage.setItem(ENTROPY_TIER_STORAGE_KEY, tier);
}

export function getCachedEntropyTier(): EntropyTier | null {
  const tier = localStorage.getItem(ENTROPY_TIER_STORAGE_KEY);
  if (tier === "red" || tier === "yellow" || tier === "green") return tier;
  return null;
}

export function clearCachedEntropyTier(): void {
  localStorage.removeItem(ENTROPY_TIER_STORAGE_KEY);
}

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

function derivePasswordSalt(password: string): FixedBuf<32> {
  const context = sha256Hash(WebBuf.fromUtf8("Keypears password salt v1"));
  return sha256Hmac(context.buf, WebBuf.fromUtf8(password));
}

function deriveLoginSalt(): FixedBuf<32> {
  return sha256Hash(WebBuf.fromUtf8("Keypears login salt v1"));
}

function deriveEncryptionSalt(): FixedBuf<32> {
  return sha256Hash(WebBuf.fromUtf8("Keypears encryption salt v1"));
}

// --- Tier 1: Password → Password Key (ephemeral, never stored) ---

export function derivePasswordKey(password: string): FixedBuf<32> {
  const passwordBuf = WebBuf.fromUtf8(password);
  const passwordSalt = derivePasswordSalt(password);
  return sha256Pbkdf(passwordBuf, passwordSalt, CLIENT_KDF_ROUNDS);
}

// --- Tier 2: Password Key → Login Key / Encryption Key ---

export function deriveLoginKeyFromPasswordKey(
  passwordKey: FixedBuf<32>,
): string {
  const loginSalt = deriveLoginSalt();
  const loginKey = sha256Pbkdf(passwordKey.buf, loginSalt, CLIENT_KDF_ROUNDS);
  return loginKey.buf.toHex();
}

export function deriveEncryptionKeyFromPasswordKey(
  passwordKey: FixedBuf<32>,
): FixedBuf<32> {
  const encryptionSalt = deriveEncryptionSalt();
  return sha256Pbkdf(passwordKey.buf, encryptionSalt, CLIENT_KDF_ROUNDS);
}

// --- Key pair operations (use encryption key directly) ---

export function generateAndEncryptKeyPairFromEncryptionKey(
  encryptionKey: FixedBuf<32>,
): {
  publicKey: string;
  encryptedPrivateKey: string;
} {
  const privateKey = FixedBuf.fromRandom(32);
  const publicKey = publicKeyCreate(privateKey);
  const encryptedPrivateKey = acs2Encrypt(privateKey.buf, encryptionKey);
  return {
    publicKey: publicKey.buf.toHex(),
    encryptedPrivateKey: encryptedPrivateKey.toHex(),
  };
}

export function decryptPrivateKey(
  encryptedPrivateKeyHex: string,
  encryptionKey: FixedBuf<32>,
): FixedBuf<32> {
  const encryptedBuf = WebBuf.fromHex(encryptedPrivateKeyHex);
  const decrypted = acs2Decrypt(encryptedBuf, encryptionKey);
  return FixedBuf.fromBuf(32, decrypted);
}

// --- Encryption key caching (localStorage) ---
// Only the encryption key is cached. The password key and login key
// are ephemeral — derived from the password, used, then discarded.
// If localStorage is compromised, the attacker can decrypt private keys
// but CANNOT derive the login key or impersonate the user.

export function cacheEncryptionKey(encryptionKey: FixedBuf<32>): void {
  localStorage.setItem(ENCRYPTION_KEY_STORAGE_KEY, encryptionKey.buf.toHex());
}

export function getCachedEncryptionKey(): FixedBuf<32> | null {
  const hex = localStorage.getItem(ENCRYPTION_KEY_STORAGE_KEY);
  if (!hex) return null;
  return FixedBuf.fromHex(32, hex);
}

export function clearCachedEncryptionKey(): void {
  localStorage.removeItem(ENCRYPTION_KEY_STORAGE_KEY);
}
