import { acs2Encrypt, acs2Decrypt, FixedBuf, WebBuf } from "@keypears/lib";
import type { MessageContent } from "./message-encryption";

/**
 * Message-specific data stored in vault when a channel is saved
 */
export interface MessageSecretBlob {
  direction: "sent" | "received";
  counterpartyAddress: string;
  myEngagementPubKey: string;
  theirEngagementPubKey: string;
  content: MessageContent;
  timestamp: number;
}

/**
 * Secret data that goes in the encrypted blob
 * Everything except server-managed fields (id, vaultId, secretId, order numbers, timestamps)
 */
export interface SecretBlobData {
  name: string;
  type: "password" | "envvar" | "apikey" | "walletkey" | "passkey" | "message";
  domain?: string;
  username?: string;
  email?: string;
  label?: string;
  encryptedData?: string; // Already encrypted password/secret value
  encryptedNotes?: string; // Already encrypted notes
  folders?: string[];
  tags?: string[];
  deleted: boolean;

  // Message-specific fields (only when type === "message")
  messageData?: MessageSecretBlob;
}

/**
 * Encrypts a secret update blob for server storage
 *
 * Takes a secret data object and encrypts it with the vault key.
 * Returns a hex-encoded string suitable for sending to the server.
 *
 * The vault key is used to encrypt everything:
 * - The blob itself (this function)
 * - The password/secret value (encryptedData field, already encrypted before calling this)
 * - The notes (encryptedNotes field, already encrypted before calling this)
 *
 * @param secret - Secret data to encrypt
 * @param vaultKey - The 32-byte vault key used for encryption
 * @returns Hex-encoded encrypted blob string
 */
export function encryptSecretUpdateBlob(
  secret: SecretBlobData,
  vaultKey: FixedBuf<32>,
): string {
  // Serialize to JSON
  const json = JSON.stringify(secret);

  // Convert to WebBuf
  const jsonBuf = WebBuf.fromUtf8(json);

  // Encrypt with ACS2
  const encrypted = acs2Encrypt(jsonBuf, vaultKey);

  // Return as hex string
  return encrypted.toHex();
}

/**
 * Decrypts a secret update blob from server
 *
 * Takes a hex-encoded encrypted blob from the server and decrypts it
 * with the vault key, returning the secret data object.
 *
 * @param encryptedBlobHex - Hex-encoded encrypted blob from server
 * @param vaultKey - The 32-byte vault key used for decryption
 * @returns Decrypted secret data object
 * @throws Error if decryption fails or JSON parsing fails
 */
export function decryptSecretUpdateBlob(
  encryptedBlobHex: string,
  vaultKey: FixedBuf<32>,
): SecretBlobData {
  // Convert from hex
  const encrypted = WebBuf.fromHex(encryptedBlobHex);

  // Decrypt with ACS2
  const decrypted = acs2Decrypt(encrypted, vaultKey);

  // Convert to string
  const json = decrypted.toUtf8();

  // Parse JSON
  const secret = JSON.parse(json) as SecretBlobData;

  return secret;
}
