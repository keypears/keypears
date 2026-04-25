import { sha256Hash, sha256Hmac } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { mlDsa65KeyPair, mlDsa65Sign } from "@webbuf/mldsa";
import { mlKem768KeyPair } from "@webbuf/mlkem";
import { aesgcmEncryptNative, aesgcmDecryptNative } from "./aesgcm";

const CLIENT_KDF_ROUNDS = 300_000;
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

// Copy a WebBuf/Uint8Array into a fresh ArrayBuffer-backed Uint8Array so
// that Web Crypto's BufferSource type is satisfied (the type system
// rejects Uint8Array<ArrayBufferLike> that might be SharedArrayBuffer).
function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.length));
  copy.set(bytes);
  return copy as Uint8Array<ArrayBuffer>;
}

// Shared PBKDF2 helper using Web Crypto.
async function pbkdf2(
  password: Uint8Array,
  salt: Uint8Array,
  rounds: number,
): Promise<FixedBuf<32>> {
  const material = await crypto.subtle.importKey(
    "raw",
    toBufferSource(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: toBufferSource(salt),
      iterations: rounds,
      hash: "SHA-256",
    },
    material,
    256,
  );
  return FixedBuf.fromBuf(32, WebBuf.fromUint8Array(new Uint8Array(bits)));
}

// --- Tier 1: Password → Password Key (ephemeral, never stored) ---

export async function derivePasswordKey(
  password: string,
): Promise<FixedBuf<32>> {
  const passwordBuf = new TextEncoder().encode(password);
  const salt = derivePasswordSalt(password).buf;
  return pbkdf2(passwordBuf, salt, CLIENT_KDF_ROUNDS);
}

// --- Tier 2: Password Key → Login Key / Encryption Key ---

export async function deriveLoginKeyFromPasswordKey(
  passwordKey: FixedBuf<32>,
): Promise<string> {
  const salt = deriveLoginSalt().buf;
  const loginKey = await pbkdf2(passwordKey.buf, salt, CLIENT_KDF_ROUNDS);
  return loginKey.buf.toHex();
}

export async function deriveEncryptionKeyFromPasswordKey(
  passwordKey: FixedBuf<32>,
): Promise<FixedBuf<32>> {
  const salt = deriveEncryptionSalt().buf;
  return pbkdf2(passwordKey.buf, salt, CLIENT_KDF_ROUNDS);
}

// --- Key pair operations (use encryption key directly) ---

export async function generateAndEncryptKeyPairFromEncryptionKey(
  encryptionKey: FixedBuf<32>,
): Promise<{
  signingPublicKey: WebBuf;
  encapPublicKey: WebBuf;
  encryptedSigningKey: WebBuf;
  encryptedDecapKey: WebBuf;
}> {
  const { verifyingKey, signingKey } = mlDsa65KeyPair();
  const { encapsulationKey, decapsulationKey } = mlKem768KeyPair();
  const encryptedSigningKey = await aesgcmEncryptNative(
    signingKey.buf,
    encryptionKey,
  );
  const encryptedDecapKey = await aesgcmEncryptNative(
    decapsulationKey.buf,
    encryptionKey,
  );
  return {
    signingPublicKey: verifyingKey.buf,
    encapPublicKey: encapsulationKey.buf,
    encryptedSigningKey,
    encryptedDecapKey,
  };
}

export async function decryptSigningKey(
  encrypted: WebBuf,
  encryptionKey: FixedBuf<32>,
): Promise<FixedBuf<4032>> {
  const decrypted = await aesgcmDecryptNative(encrypted, encryptionKey);
  return FixedBuf.fromBuf(4032, decrypted);
}

export async function decryptDecapKey(
  encrypted: WebBuf,
  encryptionKey: FixedBuf<32>,
): Promise<FixedBuf<2400>> {
  const decrypted = await aesgcmDecryptNative(encrypted, encryptionKey);
  return FixedBuf.fromBuf(2400, decrypted);
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

/**
 * Sign a PoW challenge request to prove sender identity.
 * Returns the signature hex and timestamp used.
 *
 * Uses ML-DSA-65 via @webbuf/mldsa (synchronous WASM).
 */
export function signPowRequest(
  senderAddress: string,
  recipientAddress: string,
  signingKey: FixedBuf<4032>,
): { signature: string; timestamp: number } {
  const timestamp = Date.now();
  const message = WebBuf.fromUtf8(
    `${senderAddress}:${recipientAddress}:${timestamp}`,
  );
  const sig = mlDsa65Sign(signingKey, message);
  return {
    signature: sig.buf.toHex(),
    timestamp,
  };
}
