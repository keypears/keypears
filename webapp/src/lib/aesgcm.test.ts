import { describe, it, expect } from "vitest";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { aesgcmEncrypt, aesgcmDecrypt } from "@webbuf/aesgcm";
import { aesgcmEncryptNative, aesgcmDecryptNative } from "./aesgcm";

describe("aesgcm native/webbuf format compatibility", () => {
  const key = FixedBuf.fromHex(
    32,
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  );
  const plaintextHex = "48656c6c6f2c20776f726c6421"; // "Hello, world!"
  const plaintext = WebBuf.fromHex(plaintextHex);

  it("native encrypt -> webbuf decrypt", async () => {
    const ct = await aesgcmEncryptNative(plaintext, key);
    const pt = aesgcmDecrypt(ct, key);
    expect(pt.toHex()).toBe(plaintextHex);
  });

  it("webbuf encrypt -> native decrypt", async () => {
    const ct = aesgcmEncrypt(plaintext, key);
    const pt = await aesgcmDecryptNative(ct, key);
    expect(pt.toHex()).toBe(plaintextHex);
  });

  it("native encrypt -> native decrypt", async () => {
    const ct = await aesgcmEncryptNative(plaintext, key);
    const pt = await aesgcmDecryptNative(ct, key);
    expect(pt.toHex()).toBe(plaintextHex);
  });

  it("native round-trip on 1 KB payload", async () => {
    const big = WebBuf.fromUint8Array(
      new Uint8Array(1024).map((_, i) => i & 0xff),
    );
    const ct = await aesgcmEncryptNative(big, key);
    const pt = await aesgcmDecryptNative(ct, key);
    expect(pt.toHex()).toBe(big.toHex());
  });

  it("webbuf->native round-trip on 1 KB payload", async () => {
    const big = WebBuf.fromUint8Array(
      new Uint8Array(1024).map((_, i) => i & 0xff),
    );
    const ct = aesgcmEncrypt(big, key);
    const pt = await aesgcmDecryptNative(ct, key);
    expect(pt.toHex()).toBe(big.toHex());
  });

  it("rejects tampered ciphertext", async () => {
    const ct = await aesgcmEncryptNative(plaintext, key);
    const tampered = ct.clone();
    tampered[20] ^= 0x01; // flip a bit in the ciphertext body
    await expect(aesgcmDecryptNative(tampered, key)).rejects.toThrow();
  });
});
