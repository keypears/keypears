import { FixedBuf } from "@webbuf/fixedbuf";
import { describe, expect, it } from "vitest";
import {
  decryptFolderKey,
  encryptFolderKey,
  generateSecretFolderKey,
} from "~src/index";

describe("Index", () => {
  it("should generate a 32-byte secret folder key", () => {
    const key = generateSecretFolderKey();
    expect(key.buf.length).toBe(32);
  });

  describe("encrypt, decrypt folder key", () => {
    it("should encrypt and decrypt a folder key correctly", () => {
      const password = "thisisaverysecurepassword";
      const originalKey = generateSecretFolderKey();
      const encryptedKey = encryptFolderKey(password, originalKey);
      const decryptedKey = decryptFolderKey(password, encryptedKey);
      expect(decryptedKey.buf.toHex()).toEqual(originalKey.buf.toHex());
    });
  });
});
