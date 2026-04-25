import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import {
  aesgcmMlkemEncrypt,
  aesgcmMlkemDecrypt,
} from "@webbuf/aesgcm-mlkem";
import { mlDsa65Sign, mlDsa65Verify } from "@webbuf/mldsa";
import { z } from "zod";

// --- Message schemas ---

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

// --- AAD (Additional Authenticated Data) ---

function buildMessageAad(
  senderAddress: string,
  recipientAddress: string,
): WebBuf {
  return WebBuf.fromUtf8(`${senderAddress}\0${recipientAddress}`);
}

// --- Canonical signed envelope ---
// Versioned, length-prefixed binary. Covers sender/recipient identity,
// public keys, and both ciphertexts so no field can be swapped independently.

const ENVELOPE_DOMAIN = WebBuf.fromUtf8("KeypearsMessageV1");

function lengthPrefix(field: WebBuf): WebBuf {
  const lenBuf = WebBuf.alloc(4);
  new DataView(lenBuf.buffer, lenBuf.byteOffset, 4).setUint32(0, field.length);
  return WebBuf.concat([lenBuf, field]);
}

function buildSignedEnvelope(
  senderAddress: string,
  recipientAddress: string,
  senderSigningPubKey: WebBuf,
  recipientEncapPubKey: WebBuf,
  recipientCiphertext: WebBuf,
  senderCiphertext: WebBuf,
): WebBuf {
  return WebBuf.concat([
    lengthPrefix(ENVELOPE_DOMAIN),
    lengthPrefix(WebBuf.fromUtf8(senderAddress)),
    lengthPrefix(WebBuf.fromUtf8(recipientAddress)),
    lengthPrefix(senderSigningPubKey),
    lengthPrefix(recipientEncapPubKey),
    lengthPrefix(recipientCiphertext),
    lengthPrefix(senderCiphertext),
  ]);
}

// --- Encrypt ---

export interface EncryptedMessage {
  recipientCiphertext: WebBuf;
  senderCiphertext: WebBuf;
  signature: WebBuf;
}

export function encryptMessage(
  text: string,
  senderAddress: string,
  recipientAddress: string,
  senderSigningKey: FixedBuf<4032>,
  senderSigningPubKey: WebBuf,
  senderEncapKey: FixedBuf<1184>,
  recipientEncapKey: FixedBuf<1184>,
  recipientEncapPubKey: WebBuf,
): EncryptedMessage {
  const content = JSON.stringify({ version: 1, type: "text", text });
  const plaintext = WebBuf.fromUtf8(content);
  const aad = buildMessageAad(senderAddress, recipientAddress);
  const recipientCt = aesgcmMlkemEncrypt(recipientEncapKey, plaintext, aad);
  const senderCt = aesgcmMlkemEncrypt(senderEncapKey, plaintext, aad);
  const envelope = buildSignedEnvelope(
    senderAddress,
    recipientAddress,
    senderSigningPubKey,
    recipientEncapPubKey,
    recipientCt,
    senderCt,
  );
  const sig = mlDsa65Sign(senderSigningKey, envelope);
  return {
    recipientCiphertext: recipientCt,
    senderCiphertext: senderCt,
    signature: sig.buf,
  };
}

export function encryptSecretMessage(
  secret: SecretPayload,
  senderAddress: string,
  recipientAddress: string,
  senderSigningKey: FixedBuf<4032>,
  senderSigningPubKey: WebBuf,
  senderEncapKey: FixedBuf<1184>,
  recipientEncapKey: FixedBuf<1184>,
  recipientEncapPubKey: WebBuf,
): EncryptedMessage {
  const content = JSON.stringify({ version: 1, type: "secret", secret });
  const plaintext = WebBuf.fromUtf8(content);
  const aad = buildMessageAad(senderAddress, recipientAddress);
  const recipientCt = aesgcmMlkemEncrypt(recipientEncapKey, plaintext, aad);
  const senderCt = aesgcmMlkemEncrypt(senderEncapKey, plaintext, aad);
  const envelope = buildSignedEnvelope(
    senderAddress,
    recipientAddress,
    senderSigningPubKey,
    recipientEncapPubKey,
    recipientCt,
    senderCt,
  );
  const sig = mlDsa65Sign(senderSigningKey, envelope);
  return {
    recipientCiphertext: recipientCt,
    senderCiphertext: senderCt,
    signature: sig.buf,
  };
}

// --- Verify ---

export function verifyMessageSignature(
  senderAddress: string,
  recipientAddress: string,
  senderSigningPubKey: WebBuf,
  recipientEncapPubKey: WebBuf,
  recipientCiphertext: WebBuf,
  senderCiphertext: WebBuf,
  signature: WebBuf,
): boolean {
  const envelope = buildSignedEnvelope(
    senderAddress,
    recipientAddress,
    senderSigningPubKey,
    recipientEncapPubKey,
    recipientCiphertext,
    senderCiphertext,
  );
  const verifyingKey = FixedBuf.fromBuf(1952, senderSigningPubKey);
  const sig = FixedBuf.fromBuf(3309, signature);
  return mlDsa65Verify(verifyingKey, envelope, sig);
}

// --- Decrypt ---

export function decryptMessageContent(
  encrypted: WebBuf,
  decapKey: FixedBuf<2400>,
  senderAddress: string,
  recipientAddress: string,
): MessageContent {
  const aad = buildMessageAad(senderAddress, recipientAddress);
  const decrypted = aesgcmMlkemDecrypt(decapKey, encrypted, aad);
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
