import { blake3Hash } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { describe, expect, it } from "vitest";
import {
  decryptKey,
  encryptKey,
  generateKey,
  generateSecurePassword,
  generateSecureLowercasePassword,
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
      expect(/^[a-z!@#$%^&*()\-_=+\[\]{}|;:,.<>?]+$/.test(password)).toBe(
        true,
      );
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
      expect(
        /^[a-zA-Z0-9!@#$%^&*()\-_=+\[\]{}|;:,.<>?]+$/.test(password),
      ).toBe(true);
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

  describe("generateSecureLowercasePassword", () => {
    it("should generate a secure lowercase password of specified length", () => {
      const length = 16;
      const password = generateSecureLowercasePassword(length);
      expect(password).toHaveLength(length);
      expect(/^[a-z]+$/.test(password)).toBe(true); // Only lowercase letters
    });
  });
});
