import {
  sharedSecret,
  sha256Hash,
  acs2Encrypt,
  acs2Decrypt,
  FixedBuf,
  WebBuf,
} from "@keypears/lib";

/**
 * Message content structure (encrypted portion)
 *
 * This is the actual payload that gets encrypted with the ECDH shared secret.
 * Currently only text messages are supported; future versions may add
 * password attachments, file attachments, etc.
 */
export interface MessageContent {
  version: 1;
  type: "text";
  text: string;
}

/**
 * Compute ECDH shared secret and hash to 32 bytes for ACS2 encryption
 *
 * The raw ECDH output is a 33-byte compressed point. We hash it with SHA-256
 * to produce a 32-byte symmetric key suitable for ACS2 encryption.
 *
 * @param myPrivKey - My 32-byte private key
 * @param theirPubKey - Their 33-byte compressed public key
 * @returns 32-byte symmetric key for encryption/decryption
 */
export function computeMessageKey(
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): FixedBuf<32> {
  const ecdhPoint = sharedSecret(myPrivKey, theirPubKey);
  return sha256Hash(ecdhPoint.buf);
}

/**
 * Encrypt message content with ECDH-derived key
 *
 * Takes a MessageContent object, serializes it to JSON, and encrypts it
 * using ACS2 (AES-256-CBC + SHA-256-HMAC) with the ECDH-derived key.
 *
 * @param content - The message content to encrypt
 * @param myPrivKey - My 32-byte private key (engagement key)
 * @param theirPubKey - Their 33-byte compressed public key (engagement key)
 * @returns Hex-encoded encrypted string
 */
export function encryptMessage(
  content: MessageContent,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): string {
  const messageKey = computeMessageKey(myPrivKey, theirPubKey);
  const jsonBuf = WebBuf.fromUtf8(JSON.stringify(content));
  return acs2Encrypt(jsonBuf, messageKey).toHex();
}

/**
 * Decrypt message content with ECDH-derived key
 *
 * Takes a hex-encoded encrypted string, decrypts it using ACS2 with the
 * ECDH-derived key, and parses the JSON to return a MessageContent object.
 *
 * @param encryptedHex - Hex-encoded encrypted message from server
 * @param myPrivKey - My 32-byte private key (engagement key)
 * @param theirPubKey - Their 33-byte compressed public key (engagement key)
 * @returns Decrypted message content
 * @throws Error if decryption fails or JSON is invalid
 */
export function decryptMessage(
  encryptedHex: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): MessageContent {
  const messageKey = computeMessageKey(myPrivKey, theirPubKey);
  const decrypted = acs2Decrypt(WebBuf.fromHex(encryptedHex), messageKey);
  return JSON.parse(decrypted.toUtf8()) as MessageContent;
}

/**
 * Create a text message content object
 *
 * Helper function to create a properly structured MessageContent for text messages.
 *
 * @param text - The message text
 * @returns MessageContent object ready for encryption
 */
export function createTextMessage(text: string): MessageContent {
  return {
    version: 1,
    type: "text",
    text,
  };
}
