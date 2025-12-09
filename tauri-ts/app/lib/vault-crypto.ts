import {
  derivePasswordKey,
  deriveEncryptionKey,
  deriveLoginKey,
  decryptKey,
  sha256Hash,
  WebBuf,
  FixedBuf,
} from "@keypears/lib";
import { publicKeyCreate } from "@webbuf/secp256k1";

export interface PasswordVerificationResult {
  valid: boolean;
  passwordKey?: FixedBuf<32>;
  encryptionKey?: FixedBuf<32>;
  loginKey?: FixedBuf<32>;
  vaultKey?: FixedBuf<32>;
  vaultPublicKey?: FixedBuf<33>;
}

/**
 * Verifies a vault password by:
 * 1. Deriving encryption key from password with vault ID
 * 2. Decrypting the vault key
 * 3. Deriving public key from vault key
 * 4. Hashing public key and comparing with stored pubkeyhash
 */
export function verifyVaultPassword(
  password: string,
  vaultId: string,
  encryptedVaultKeyHex: string,
  storedVaultPubKeyHashHex: string,
): PasswordVerificationResult {
  try {
    // 1. Derive password key from password with vault ID salting
    const passwordKey = derivePasswordKey(password, vaultId);

    // 2. Derive encryption key and login key from password key
    const encryptionKey = deriveEncryptionKey(passwordKey);
    const loginKey = deriveLoginKey(passwordKey);

    // 3. Decrypt the vault key
    const encryptedVaultKey = WebBuf.fromHex(encryptedVaultKeyHex);
    const decryptedVaultKeyBuf = decryptKey(encryptedVaultKey, encryptionKey);
    const vaultKey = FixedBuf.fromBuf(32, decryptedVaultKeyBuf.buf);

    // 4. Derive public key from decrypted vault key
    const vaultPublicKey = publicKeyCreate(vaultKey);

    // 5. Hash the public key
    const derivedPubKeyHash = sha256Hash(vaultPublicKey.buf);

    // 6. Compare with stored pubkeyhash
    if (derivedPubKeyHash.buf.toHex() === storedVaultPubKeyHashHex) {
      // Password correct - vault unlocked
      return {
        valid: true,
        passwordKey,
        encryptionKey,
        loginKey,
        vaultKey,
        vaultPublicKey,
      };
    }

    // Pubkeyhash mismatch = wrong password or corrupted data
    return { valid: false };
  } catch (error) {
    // Decryption failed or other error = wrong password
    console.error("Error verifying vault password:", error);
    return { valid: false };
  }
}
