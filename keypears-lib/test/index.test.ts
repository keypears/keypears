import { FixedBuf } from "@webbuf/fixedbuf";
import { describe, expect, it } from "vitest";
import { decryptKey, encryptKey, generateKey } from "~src/index";

describe("Index", () => {
  it("should generate a 32-byte secret folder key", () => {
    const key = generateKey();
    expect(key.buf.length).toBe(32);
  });

  describe("encrypt, decrypt folder key", () => {
    it("should encrypt and decrypt a folder key correctly", () => {
      const password = "thisisaverysecurepassword";
      const originalKey = generateKey();
      const encryptedKey = encryptKey(password, originalKey);
      const decryptedKey = decryptKey(password, encryptedKey);
      expect(decryptedKey.buf.toHex()).toEqual(originalKey.buf.toHex());
    });
  });
});
