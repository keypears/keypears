import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";

/**
 * AES-256-GCM encrypt using the Web Crypto API (crypto.subtle).
 *
 * Output format matches @webbuf/aesgcm byte-for-byte:
 *
 *   [IV (12 bytes)] || [ciphertext || auth tag (16 bytes)]
 *
 * Ciphertext produced here can be decrypted by @webbuf/aesgcm and
 * vice versa.
 */
export async function aesgcmEncryptNative(
  plaintext: WebBuf,
  key: FixedBuf<32>,
): Promise<WebBuf> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buf,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    plaintext,
  );
  return WebBuf.concat([
    WebBuf.fromUint8Array(iv),
    WebBuf.fromUint8Array(new Uint8Array(encrypted)),
  ]);
}

/**
 * AES-256-GCM decrypt using the Web Crypto API.
 *
 * Expects the ciphertext format produced by `aesgcmEncryptNative` or
 * `@webbuf/aesgcm`: [IV (12 bytes)] || [ciphertext || auth tag (16 bytes)].
 */
export async function aesgcmDecryptNative(
  ciphertext: WebBuf,
  key: FixedBuf<32>,
): Promise<WebBuf> {
  if (ciphertext.length < 28) {
    throw new Error("Data must be at least 28 bytes (12 nonce + 16 tag)");
  }
  const iv = ciphertext.slice(0, 12);
  const ct = ciphertext.slice(12);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buf,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ct,
  );
  return WebBuf.fromUint8Array(new Uint8Array(plaintext));
}
