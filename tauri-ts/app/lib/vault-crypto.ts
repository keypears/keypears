import {
  derivePasswordKey,
  encryptKey,
  decryptKey,
  WebBuf,
} from "@keypears/lib";
import type { FixedBuf } from "@keypears/lib";

export interface PasswordVerificationResult {
  valid: boolean;
  passwordKey?: FixedBuf<32>;
}

/**
 * Verifies a vault password by deriving the password key and comparing with stored encrypted version
 */
export function verifyVaultPassword(
  password: string,
  encryptedPasswordKey: string,
): PasswordVerificationResult {
  try {
    // 1. Derive password key from password
    const passwordKey = derivePasswordKey(password);

    // 2. Encrypt the password key with itself (for verification)
    const computedEncryptedPasswordKey = encryptKey(passwordKey, passwordKey);

    // 3. Compare computed encrypted password key with stored version
    if (computedEncryptedPasswordKey.toHex() === encryptedPasswordKey) {
      return { valid: true, passwordKey };
    }

    return { valid: false };
  } catch (error) {
    console.error("Error verifying vault password:", error);
    return { valid: false };
  }
}

/**
 * Decrypts the encrypted password key using the password key
 */
export function decryptPasswordKey(
  passwordKey: FixedBuf<32>,
  encryptedPasswordKey: string,
): FixedBuf<32> {
  const encryptedPasswordKeyBuf = WebBuf.fromHex(encryptedPasswordKey);
  return decryptKey(encryptedPasswordKeyBuf, passwordKey);
}
