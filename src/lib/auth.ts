import { sha256Hash, sha256Hmac } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { publicKeyCreate } from "@webbuf/secp256k1";
import { acs2Encrypt, acs2Decrypt } from "@webbuf/acs2";

const CLIENT_KDF_ROUNDS = 100_000;
const PASSWORD_KEY_STORAGE_KEY = "keypears_password_key";

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

// --- Tier 1: Password → Password Key ---

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

// --- Convenience: Password → Login Key (for login page) ---

export function deriveLoginKey(password: string): string {
  const passwordKey = derivePasswordKey(password);
  return deriveLoginKeyFromPasswordKey(passwordKey);
}

// --- Key pair operations ---

export function generateAndEncryptKeyPairFromPasswordKey(
  passwordKey: FixedBuf<32>,
): {
  publicKey: string;
  encryptedPrivateKey: string;
} {
  const privateKey = FixedBuf.fromRandom(32);
  const publicKey = publicKeyCreate(privateKey);
  const encryptionKey = deriveEncryptionKeyFromPasswordKey(passwordKey);
  const encryptedPrivateKey = acs2Encrypt(privateKey.buf, encryptionKey);
  return {
    publicKey: publicKey.buf.toHex(),
    encryptedPrivateKey: encryptedPrivateKey.toHex(),
  };
}

export function generateAndEncryptKeyPair(password: string): {
  publicKey: string;
  encryptedPrivateKey: string;
} {
  const passwordKey = derivePasswordKey(password);
  return generateAndEncryptKeyPairFromPasswordKey(passwordKey);
}

export function decryptPrivateKey(
  encryptedPrivateKeyHex: string,
  passwordKey: FixedBuf<32>,
): FixedBuf<32> {
  const encryptionKey = deriveEncryptionKeyFromPasswordKey(passwordKey);
  const encryptedBuf = WebBuf.fromHex(encryptedPrivateKeyHex);
  const decrypted = acs2Decrypt(encryptedBuf, encryptionKey);
  return FixedBuf.fromBuf(32, decrypted);
}

// --- Password key caching (localStorage) ---

export function cachePasswordKey(passwordKey: FixedBuf<32>): void {
  localStorage.setItem(PASSWORD_KEY_STORAGE_KEY, passwordKey.buf.toHex());
}

export function getCachedPasswordKey(): FixedBuf<32> | null {
  const hex = localStorage.getItem(PASSWORD_KEY_STORAGE_KEY);
  if (!hex) return null;
  return FixedBuf.fromHex(32, hex);
}

export function clearCachedPasswordKey(): void {
  localStorage.removeItem(PASSWORD_KEY_STORAGE_KEY);
}
