import { sha256Hash, sha256Hmac } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { publicKeyCreate } from "@webbuf/secp256k1";
import { acs2Encrypt, acs2Decrypt } from "@webbuf/acs2";

const CLIENT_KDF_ROUNDS = 100_000;

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

function derivePasswordKey(password: string): FixedBuf<32> {
  const passwordBuf = WebBuf.fromUtf8(password);
  const passwordSalt = derivePasswordSalt(password);
  return sha256Pbkdf(passwordBuf, passwordSalt, CLIENT_KDF_ROUNDS);
}

/**
 * Derive a login key from a password (CLIENT-SIDE).
 * Returns 64-char hex string. The password never leaves the client.
 */
export function deriveLoginKey(password: string): string {
  const passwordKey = derivePasswordKey(password);
  const loginSalt = deriveLoginSalt();
  const loginKey = sha256Pbkdf(passwordKey.buf, loginSalt, CLIENT_KDF_ROUNDS);
  return loginKey.buf.toHex();
}

/**
 * Derive an encryption key from a password (CLIENT-SIDE).
 * Used to encrypt/decrypt the user's private key.
 */
function deriveEncryptionKey(password: string): FixedBuf<32> {
  const passwordKey = derivePasswordKey(password);
  const encryptionSalt = deriveEncryptionSalt();
  return sha256Pbkdf(passwordKey.buf, encryptionSalt, CLIENT_KDF_ROUNDS);
}

/**
 * Generate a new key pair, encrypt the private key with the password,
 * and return everything needed for registration.
 */
export function generateAndEncryptKeyPair(password: string): {
  publicKey: string;
  encryptedPrivateKey: string;
} {
  const privateKey = FixedBuf.fromRandom(32);
  const publicKey = publicKeyCreate(privateKey);
  const encryptionKey = deriveEncryptionKey(password);
  const encryptedPrivateKey = acs2Encrypt(privateKey.buf, encryptionKey);
  return {
    publicKey: publicKey.buf.toHex(),
    encryptedPrivateKey: encryptedPrivateKey.toHex(),
  };
}

/**
 * Decrypt a private key using the password (CLIENT-SIDE).
 */
export function decryptPrivateKey(
  encryptedPrivateKeyHex: string,
  password: string,
): FixedBuf<32> {
  const encryptionKey = deriveEncryptionKey(password);
  const encryptedBuf = WebBuf.fromHex(encryptedPrivateKeyHex);
  const decrypted = acs2Decrypt(encryptedBuf, encryptionKey);
  return FixedBuf.fromBuf(32, decrypted);
}
