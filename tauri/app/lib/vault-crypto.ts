import {
  derivePasswordKey,
  deriveEncryptionKey,
  decryptKey,
  blake3Hash,
  WebBuf,
} from "@keypears/lib";
import type { FixedBuf } from "@keypears/lib";

export interface PasswordVerificationResult {
  valid: boolean;
  passwordKey?: FixedBuf<32>;
}

/**
 * Verifies a vault password by deriving keys and comparing vault key hash
 */
export function verifyVaultPassword(
  password: string,
  encryptedVaultKey: string,
  hashedVaultKey: string,
): PasswordVerificationResult {
  try {
    // 1. Derive password key from password
    const passwordKey = derivePasswordKey(password);

    // 2. Derive encryption key from password key
    const encryptionKey = deriveEncryptionKey(passwordKey);

    // 3. Decrypt vault key with encryption key
    const encryptedVaultKeyBuf = WebBuf.fromHex(encryptedVaultKey);
    const decryptedVaultKey = decryptKey(encryptedVaultKeyBuf, encryptionKey);

    // 4. Hash the decrypted vault key
    const computedHash = blake3Hash(decryptedVaultKey.buf);

    // 5. Compare computed hash with stored hash
    if (computedHash.toHex() === hashedVaultKey) {
      return { valid: true, passwordKey };
    }

    return { valid: false };
  } catch (error) {
    console.error("Error verifying vault password:", error);
    return { valid: false };
  }
}

/**
 * Gets the decrypted vault key using the password key
 */
export function getVaultKey(
  passwordKey: FixedBuf<32>,
  encryptedVaultKey: string,
): FixedBuf<32> {
  const encryptionKey = deriveEncryptionKey(passwordKey);
  const encryptedVaultKeyBuf = WebBuf.fromHex(encryptedVaultKey);
  return decryptKey(encryptedVaultKeyBuf, encryptionKey);
}
