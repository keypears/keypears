import { blake3Hash } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
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
});
