import { blake3Hash } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { describe, expect, it } from "vitest";
import {
  calculatePasswordEntropy,
  decryptKey,
  encryptKey,
  generateKey,
  generateSecurePassword,
} from "~src/index";

describe("Index", () => {
  it("should generate a 32-byte secret key", () => {
    const key = generateKey();
    expect(key.buf.length).toBe(32);
  });

  describe("encrypt, decrypt folder key", () => {
    it("should encrypt and decrypt a key correctly", () => {
      const password = "thisisaverysecurepassword";
      const originalKey = generateKey();
      const encryptedKey = encryptKey(password, originalKey);
      const decryptedKey = decryptKey(password, encryptedKey);
      expect(decryptedKey.buf.toHex()).toEqual(originalKey.buf.toHex());
    });

    it("should produce the exact same encrypted output for the same input", () => {
      const password = "thisisaverysecurepassword";
      const key = blake3Hash(WebBuf.fromUtf8("deterministic key"));
      const iv = FixedBuf.fromHex(16, "000102030405060708090a0b0c0d0e0f");
      const encryptedKey = encryptKey(password, key, iv);
      expect(encryptedKey.toHex()).toBe(
        "4a7d9da92478b59156a4967f7d626e077ca271feddc7f380df0f689eb4e71176000102030405060708090a0b0c0d0e0fe0c1c6d13d8952fcd120b55ef52ed52db1c238b04570f7693bd0426b55d5a1802f29f3f11e0d5715c061e394942fbd80",
      );
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
});
