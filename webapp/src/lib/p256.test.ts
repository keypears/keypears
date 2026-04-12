import { describe, it, expect } from "vitest";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import {
  p256PublicKeyCreate,
  p256PrivateKeyToJwk,
  p256PublicKeyToJwk,
} from "@webbuf/p256";

// End-to-end validation that webbuf's JWK helpers plus Web Crypto
// produce working ECDSA and ECDH operations for keys stored in our
// 33-byte compressed + 32-byte raw scalar format.

describe("P-256 Web Crypto interop via webbuf JWK helpers", () => {
  const priv = FixedBuf.fromHex(
    32,
    "c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721",
  );
  const pub = p256PublicKeyCreate(priv);

  it("ECDSA sign + verify round-trip via Web Crypto", async () => {
    const privJwk = p256PrivateKeyToJwk(priv);
    const pubJwk = p256PublicKeyToJwk(pub);

    const signKey = await crypto.subtle.importKey(
      "jwk",
      privJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const verifyKey = await crypto.subtle.importKey(
      "jwk",
      pubJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );

    const message = new TextEncoder().encode("hello keypears");
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signKey,
      message,
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      sig,
      message,
    );
    expect(ok).toBe(true);
    expect(new Uint8Array(sig).length).toBe(64);
  });

  it("ECDSA verify rejects tampered message", async () => {
    const privJwk = p256PrivateKeyToJwk(priv);
    const pubJwk = p256PublicKeyToJwk(pub);

    const signKey = await crypto.subtle.importKey(
      "jwk",
      privJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const verifyKey = await crypto.subtle.importKey(
      "jwk",
      pubJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );

    const message = new TextEncoder().encode("hello keypears");
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signKey,
      message,
    );
    const tampered = new TextEncoder().encode("hello keypearz");
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      sig,
      tampered,
    );
    expect(ok).toBe(false);
  });

  it("ECDH between two parties produces the same shared secret", async () => {
    // Alice
    const alicePriv = FixedBuf.fromHex(
      32,
      "1111111111111111111111111111111111111111111111111111111111111111",
    );
    const alicePub = p256PublicKeyCreate(alicePriv);

    // Bob
    const bobPriv = FixedBuf.fromHex(
      32,
      "2222222222222222222222222222222222222222222222222222222222222222",
    );
    const bobPub = p256PublicKeyCreate(bobPriv);

    // Alice's side
    const alicePrivKey = await crypto.subtle.importKey(
      "jwk",
      p256PrivateKeyToJwk(alicePriv),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
    const bobPubKeyForAlice = await crypto.subtle.importKey(
      "jwk",
      p256PublicKeyToJwk(bobPub),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const aliceShared = await crypto.subtle.deriveBits(
      { name: "ECDH", public: bobPubKeyForAlice },
      alicePrivKey,
      256,
    );

    // Bob's side
    const bobPrivKey = await crypto.subtle.importKey(
      "jwk",
      p256PrivateKeyToJwk(bobPriv),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
    const alicePubKeyForBob = await crypto.subtle.importKey(
      "jwk",
      p256PublicKeyToJwk(alicePub),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const bobShared = await crypto.subtle.deriveBits(
      { name: "ECDH", public: alicePubKeyForBob },
      bobPrivKey,
      256,
    );

    expect(WebBuf.fromUint8Array(new Uint8Array(aliceShared)).toHex()).toBe(
      WebBuf.fromUint8Array(new Uint8Array(bobShared)).toHex(),
    );
  });
});
