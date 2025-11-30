import { blake3Hash } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { describe, expect, it } from "vitest";
import {
  calculatePasswordEntropy,
  decryptKey,
  decryptPassword,
  deriveEncryptionKey,
  deriveEncryptionSalt,
  deriveLoginKey,
  deriveLoginSalt,
  derivePasswordKey,
  encryptKey,
  encryptPassword,
  generateKey,
  generateSecurePassword,
} from "~src/index";

describe("Index", () => {
  const testVaultId = "01JDQXZ9K8XQXQXQXQXQXQXQXQ";

  it("should generate a 32-byte secret key", () => {
    const key = generateKey();
    expect(key.buf.length).toBe(32);
  });

  describe("encrypt, decrypt key", () => {
    it("should encrypt and decrypt a key correctly", () => {
      const encryptionKey = generateKey();
      const originalKey = generateKey();
      const encryptedKey = encryptKey(originalKey, encryptionKey);
      const decryptedKey = decryptKey(encryptedKey, encryptionKey);
      expect(decryptedKey.buf.toHex()).toEqual(originalKey.buf.toHex());
    });

    it("should produce the exact same encrypted output for the same input", () => {
      const encryptionKey = blake3Hash(
        WebBuf.fromUtf8("deterministic encryption key"),
      );
      const keyToEncrypt = blake3Hash(WebBuf.fromUtf8("deterministic key"));
      const iv = FixedBuf.fromHex(16, "000102030405060708090a0b0c0d0e0f");
      const encryptedKey = encryptKey(keyToEncrypt, encryptionKey, iv);
      expect(encryptedKey.toHex()).toBe(
        "391d2c03a37bd24cd07bafcff57819c326900425bcbfb960fb1f92b7edc8e2f9000102030405060708090a0b0c0d0e0f919023e4474560a150cc3dc8ae1740a8b56ef795beedf4c2673fd6fe3ac1e05588ecd21e431c36684a94184bebd096c9",
      );
    });

    it("should work with derived encryption key from password", () => {
      const password = "thisisaverysecurepassword";
      const passwordKey = derivePasswordKey(password, testVaultId);
      const encryptionKey = deriveEncryptionKey(passwordKey);

      const originalKey = generateKey();
      const encryptedKey = encryptKey(originalKey, encryptionKey);
      const decryptedKey = decryptKey(encryptedKey, encryptionKey);

      expect(decryptedKey.buf.toHex()).toEqual(originalKey.buf.toHex());
    });
  });

  describe("generateSecurePassword", () => {
    it("should generate lowercase-only password by default", () => {
      const length = 16;
      const password = generateSecurePassword({ length });
      expect(password).toHaveLength(length);
      expect(/^[a-z]+$/.test(password)).toBe(true);
    });

    it("should generate password with uppercase when enabled", () => {
      const length = 32;
      const password = generateSecurePassword({
        length,
        lowercase: true,
        uppercase: true,
      });
      expect(password).toHaveLength(length);
      expect(/^[a-zA-Z]+$/.test(password)).toBe(true);
    });

    it("should generate password with numbers when enabled", () => {
      const length = 32;
      const password = generateSecurePassword({
        length,
        lowercase: true,
        numbers: true,
      });
      expect(password).toHaveLength(length);
      expect(/^[a-z0-9]+$/.test(password)).toBe(true);
    });

    it("should generate password with symbols when enabled", () => {
      const length = 32;
      const password = generateSecurePassword({
        length,
        lowercase: true,
        symbols: true,
      });
      expect(password).toHaveLength(length);
      expect(/^[a-z!@#$%^&*()\-_=+[\]{}|;:,.<>?]+$/.test(password)).toBe(true);
    });

    it("should generate password with all character sets enabled", () => {
      const length = 32;
      const password = generateSecurePassword({
        length,
        lowercase: true,
        uppercase: true,
        numbers: true,
        symbols: true,
      });
      expect(password).toHaveLength(length);
      expect(/^[a-zA-Z0-9!@#$%^&*()\-_=+[\]{}|;:,.<>?]+$/.test(password)).toBe(
        true,
      );
    });

    it("should throw error if no character sets are enabled", () => {
      expect(() =>
        generateSecurePassword({
          length: 16,
          lowercase: false,
          uppercase: false,
          numbers: false,
          symbols: false,
        }),
      ).toThrow("At least one character set must be enabled");
    });

    it("should throw error for invalid length", () => {
      expect(() => generateSecurePassword({ length: 0 })).toThrow(
        "Password length must be greater than 0",
      );
      expect(() => generateSecurePassword({ length: -1 })).toThrow(
        "Password length must be greater than 0",
      );
    });

    it("should generate different passwords on subsequent calls", () => {
      const password1 = generateSecurePassword({ length: 16 });
      const password2 = generateSecurePassword({ length: 16 });
      expect(password1).not.toEqual(password2);
    });
  });

  describe("calculatePasswordEntropy", () => {
    it("should calculate entropy for lowercase-only password", () => {
      // 16 lowercase chars: 16 * log2(26) ≈ 75.2 bits
      const entropy = calculatePasswordEntropy(16, { lowercase: true });
      expect(entropy).toBeCloseTo(75.2, 1);
    });

    it("should calculate entropy for lowercase + uppercase password", () => {
      // 16 chars with 52 charset: 16 * log2(52) ≈ 91.2 bits
      const entropy = calculatePasswordEntropy(16, {
        lowercase: true,
        uppercase: true,
      });
      expect(entropy).toBeCloseTo(91.2, 1);
    });

    it("should calculate entropy for all character sets", () => {
      // 16 chars with 90 charset (26+26+10+28): 16 * log2(90) ≈ 103.9 bits
      const entropy = calculatePasswordEntropy(16, {
        lowercase: true,
        uppercase: true,
        numbers: true,
        symbols: true,
      });
      expect(entropy).toBeCloseTo(103.9, 1);
    });

    it("should calculate entropy for different lengths", () => {
      const entropy8 = calculatePasswordEntropy(8, { lowercase: true });
      const entropy16 = calculatePasswordEntropy(16, { lowercase: true });
      const entropy32 = calculatePasswordEntropy(32, { lowercase: true });

      // Entropy should scale linearly with length
      expect(entropy16).toBeCloseTo(entropy8 * 2, 1);
      expect(entropy32).toBeCloseTo(entropy16 * 2, 1);
    });

    it("should return 0 for no character sets enabled", () => {
      const entropy = calculatePasswordEntropy(16, {
        lowercase: false,
        uppercase: false,
        numbers: false,
        symbols: false,
      });
      expect(entropy).toBe(0);
    });

    it("should return 0 for zero length", () => {
      const entropy = calculatePasswordEntropy(0, { lowercase: true });
      expect(entropy).toBe(0);
    });

    it("should calculate exact entropy for known values", () => {
      // 16 lowercase: log2(26^16) = 16 * log2(26)
      const entropy = calculatePasswordEntropy(16, { lowercase: true });
      expect(entropy).toBe(16 * Math.log2(26));
    });

    it("should meet 75-bit minimum threshold for 16 lowercase chars", () => {
      const entropy = calculatePasswordEntropy(16, { lowercase: true });
      expect(entropy).toBeGreaterThanOrEqual(75);
    });

    it("should meet 100-bit recommended threshold for appropriate passwords", () => {
      // 22 lowercase chars should exceed 100 bits
      const entropy = calculatePasswordEntropy(22, { lowercase: true });
      expect(entropy).toBeGreaterThanOrEqual(100);
    });

    it("should meet 128-bit maximum tier for strong passwords", () => {
      // 28 lowercase chars should exceed 128 bits
      const entropy = calculatePasswordEntropy(28, { lowercase: true });
      expect(entropy).toBeGreaterThanOrEqual(128);
    });
  });

  describe("encrypt, decrypt password", () => {
    it("should encrypt and decrypt a password correctly", () => {
      const vaultKey = generateKey();
      const password = "mySecureP@ssw0rd123!";
      const encryptedPassword = encryptPassword(password, vaultKey);
      const decryptedPassword = decryptPassword(encryptedPassword, vaultKey);
      expect(decryptedPassword).toBe(password);
    });

    it("should produce different encrypted values for different passwords", () => {
      const vaultKey = generateKey();
      const password1 = "password1";
      const password2 = "password2";
      const encrypted1 = encryptPassword(password1, vaultKey);
      const encrypted2 = encryptPassword(password2, vaultKey);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should produce different encrypted values for same password with different keys", () => {
      const vaultKey1 = generateKey();
      const vaultKey2 = generateKey();
      const password = "mySecurePassword";
      const encrypted1 = encryptPassword(password, vaultKey1);
      const encrypted2 = encryptPassword(password, vaultKey2);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should handle empty password", () => {
      const vaultKey = generateKey();
      const password = "";
      const encryptedPassword = encryptPassword(password, vaultKey);
      const decryptedPassword = decryptPassword(encryptedPassword, vaultKey);
      expect(decryptedPassword).toBe("");
    });

    it("should handle long passwords", () => {
      const vaultKey = generateKey();
      const password = "a".repeat(1000);
      const encryptedPassword = encryptPassword(password, vaultKey);
      const decryptedPassword = decryptPassword(encryptedPassword, vaultKey);
      expect(decryptedPassword).toBe(password);
    });

    it("should handle special characters and unicode", () => {
      const vaultKey = generateKey();
      const password = "🔒パスワード!@#$%^&*()[];',./{}:<>?";
      const encryptedPassword = encryptPassword(password, vaultKey);
      const decryptedPassword = decryptPassword(encryptedPassword, vaultKey);
      expect(decryptedPassword).toBe(password);
    });

    it("should return hex-encoded string", () => {
      const vaultKey = generateKey();
      const password = "test";
      const encryptedPassword = encryptPassword(password, vaultKey);
      // Check that it's a valid hex string
      expect(/^[0-9a-f]+$/i.test(encryptedPassword)).toBe(true);
      // Check that it's not empty
      expect(encryptedPassword.length).toBeGreaterThan(0);
    });

    it("should work with vault key derived from password", () => {
      const password = "userMasterPassword";
      const passwordKey = derivePasswordKey(password, testVaultId);
      const encryptionKey = deriveEncryptionKey(passwordKey);

      // In real use, we'd decrypt the vault key with encryptionKey
      // For this test, we'll just use a random vault key
      const vaultKey = generateKey();

      const secretPassword = "myGitHubPassword123";
      const encrypted = encryptPassword(secretPassword, vaultKey);
      const decrypted = decryptPassword(encrypted, vaultKey);

      expect(decrypted).toBe(secretPassword);
    });
  });

  describe("three-tier key derivation", () => {
    it("should derive password key from password", () => {
      const password = "thisisaverysecurepassword";
      const passwordKey = derivePasswordKey(password, testVaultId);
      expect(passwordKey.buf.length).toBe(32);
    });

    it("should derive same password key for same password", () => {
      const password = "thisisaverysecurepassword";
      const passwordKey1 = derivePasswordKey(password, testVaultId);
      const passwordKey2 = derivePasswordKey(password, testVaultId);
      expect(passwordKey1.buf.toHex()).toBe(passwordKey2.buf.toHex());
    });

    it("should derive different password keys for different passwords", () => {
      const passwordKey1 = derivePasswordKey("password1", testVaultId);
      const passwordKey2 = derivePasswordKey("password2", testVaultId);
      expect(passwordKey1.buf.toHex()).not.toBe(passwordKey2.buf.toHex());
    });

    it("should derive encryption key from password key", () => {
      const password = "thisisaverysecurepassword";
      const passwordKey = derivePasswordKey(password, testVaultId);
      const encryptionKey = deriveEncryptionKey(passwordKey);
      expect(encryptionKey.buf.length).toBe(32);
    });

    it("should derive login key from password key", () => {
      const password = "thisisaverysecurepassword";
      const passwordKey = derivePasswordKey(password, testVaultId);
      const loginKey = deriveLoginKey(passwordKey);
      expect(loginKey.buf.length).toBe(32);
    });

    it("should derive different keys for encryption and login", () => {
      const password = "thisisaverysecurepassword";
      const passwordKey = derivePasswordKey(password, testVaultId);
      const encryptionKey = deriveEncryptionKey(passwordKey);
      const loginKey = deriveLoginKey(passwordKey);

      // All keys should be different
      expect(passwordKey.buf.toHex()).not.toBe(encryptionKey.buf.toHex());
      expect(passwordKey.buf.toHex()).not.toBe(loginKey.buf.toHex());
      expect(encryptionKey.buf.toHex()).not.toBe(loginKey.buf.toHex());
    });

    it("should derive same encryption key from same password key", () => {
      const password = "thisisaverysecurepassword";
      const passwordKey = derivePasswordKey(password, testVaultId);
      const encryptionKey1 = deriveEncryptionKey(passwordKey);
      const encryptionKey2 = deriveEncryptionKey(passwordKey);
      expect(encryptionKey1.buf.toHex()).toBe(encryptionKey2.buf.toHex());
    });

    it("should derive same login key from same password key", () => {
      const password = "thisisaverysecurepassword";
      const passwordKey = derivePasswordKey(password, testVaultId);
      const loginKey1 = deriveLoginKey(passwordKey);
      const loginKey2 = deriveLoginKey(passwordKey);
      expect(loginKey1.buf.toHex()).toBe(loginKey2.buf.toHex());
    });

    it("should have constant salts for encryption and login", () => {
      const encryptionSalt1 = deriveEncryptionSalt();
      const encryptionSalt2 = deriveEncryptionSalt();
      const loginSalt1 = deriveLoginSalt();
      const loginSalt2 = deriveLoginSalt();

      expect(encryptionSalt1.buf.toHex()).toBe(encryptionSalt2.buf.toHex());
      expect(loginSalt1.buf.toHex()).toBe(loginSalt2.buf.toHex());
      expect(encryptionSalt1.buf.toHex()).not.toBe(loginSalt1.buf.toHex());
    });

    it("should produce deterministic but different keys through the full flow", () => {
      const password = "thisisaverysecurepassword";

      // First derivation
      const passwordKey1 = derivePasswordKey(password, testVaultId);
      const encryptionKey1 = deriveEncryptionKey(passwordKey1);
      const loginKey1 = deriveLoginKey(passwordKey1);

      // Second derivation
      const passwordKey2 = derivePasswordKey(password, testVaultId);
      const encryptionKey2 = deriveEncryptionKey(passwordKey2);
      const loginKey2 = deriveLoginKey(passwordKey2);

      // Same password should produce same keys
      expect(passwordKey1.buf.toHex()).toBe(passwordKey2.buf.toHex());
      expect(encryptionKey1.buf.toHex()).toBe(encryptionKey2.buf.toHex());
      expect(loginKey1.buf.toHex()).toBe(loginKey2.buf.toHex());
    });
  });
});
