import { sha256Hash } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import {
  p256PrivateKeyToJwk,
  p256PublicKeyToJwk,
  p256PublicKeyVerify,
} from "@webbuf/p256";
import { aesgcmEncryptNative, aesgcmDecryptNative } from "./aesgcm";
import { z } from "zod";

// --- Message schemas (no unions) ---

const MessageEnvelope = z.object({
  version: z.number(),
  type: z.string(),
});

const TextContent = z.object({
  text: z.string(),
});

const SecretContent = z.object({
  secret: z.object({
    name: z.string(),
    secretType: z.string(),
    fields: z.record(z.string(), z.string()),
  }),
});

export type TextMessage = { version: number; type: "text"; text: string };
export type SecretMessage = {
  version: number;
  type: "secret";
  secret: { name: string; secretType: string; fields: Record<string, string> };
};
export type MessageContent = TextMessage | SecretMessage;

export type SecretPayload = SecretMessage["secret"];

// --- ECDH key derivation ---
//
// Uses Web Crypto's ECDH via JWK import. deriveBits returns the raw 32-byte
// X coordinate of d*P (NOT the 33-byte compressed form webbuf returns), so
// the derived message key is SHA-256(rawX). Both sides of an exchange
// must use this path to agree on the same key.

export async function computeMessageKey(
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): Promise<FixedBuf<32>> {
  // Validate the peer's public key is a well-formed P-256 point on the
  // curve before doing any ECDH. P-256 has cofactor 1, so on-curve implies
  // the correct prime-order subgroup — no separate subgroup check needed.
  if (!p256PublicKeyVerify(theirPubKey)) {
    throw new Error("Invalid P-256 public key");
  }
  const privJwk = p256PrivateKeyToJwk(myPrivKey);
  const pubJwk = p256PublicKeyToJwk(theirPubKey);
  const [priv, pub] = await Promise.all([
    crypto.subtle.importKey(
      "jwk",
      privJwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    ),
    crypto.subtle.importKey(
      "jwk",
      pubJwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    ),
  ]);
  const raw = await crypto.subtle.deriveBits(
    { name: "ECDH", public: pub },
    priv,
    256,
  );
  return sha256Hash(WebBuf.fromUint8Array(new Uint8Array(raw)));
}

// --- Encrypt ---

export async function encryptMessage(
  text: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): Promise<string> {
  const key = await computeMessageKey(myPrivKey, theirPubKey);
  const content = JSON.stringify({ version: 1, type: "text", text });
  const encrypted = await aesgcmEncryptNative(WebBuf.fromUtf8(content), key);
  return encrypted.toHex();
}

export async function encryptSecretMessage(
  secret: SecretPayload,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): Promise<string> {
  const key = await computeMessageKey(myPrivKey, theirPubKey);
  const content = JSON.stringify({ version: 1, type: "secret", secret });
  const encrypted = await aesgcmEncryptNative(WebBuf.fromUtf8(content), key);
  return encrypted.toHex();
}

// --- Decrypt ---

export async function decryptMessageContent(
  encryptedHex: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): Promise<MessageContent> {
  const key = await computeMessageKey(myPrivKey, theirPubKey);
  const decrypted = await aesgcmDecryptNative(WebBuf.fromHex(encryptedHex), key);
  const parsed = JSON.parse(decrypted.toUtf8());
  const envelope = MessageEnvelope.parse(parsed);

  if (envelope.type === "text") {
    const { text } = TextContent.parse(parsed);
    return { version: envelope.version, type: "text", text };
  }
  if (envelope.type === "secret") {
    const { secret } = SecretContent.parse(parsed);
    return { version: envelope.version, type: "secret", secret };
  }
  throw new Error(`Unknown message type: ${envelope.type}`);
}

/** Legacy convenience — decrypts and returns just the text for text messages. */
export async function decryptMessage(
  encryptedHex: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): Promise<string> {
  const content = await decryptMessageContent(
    encryptedHex,
    myPrivKey,
    theirPubKey,
  );
  if (content.type !== "text") throw new Error("Not a text message");
  return content.text;
}
