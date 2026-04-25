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
  senderSigningPubKeyHex: string,
  recipientEncapPubKeyHex: string,
  recipientCiphertext: WebBuf,
  senderCiphertext: WebBuf,
): WebBuf {
  return WebBuf.concat([
    lengthPrefix(ENVELOPE_DOMAIN),
    lengthPrefix(WebBuf.fromUtf8(senderAddress)),
    lengthPrefix(WebBuf.fromUtf8(recipientAddress)),
    lengthPrefix(WebBuf.fromHex(senderSigningPubKeyHex)),
    lengthPrefix(WebBuf.fromHex(recipientEncapPubKeyHex)),
    lengthPrefix(recipientCiphertext),
    lengthPrefix(senderCiphertext),
  ]);
}

// --- Encrypt ---

export interface EncryptedMessage {
  recipientCiphertext: string;
  senderCiphertext: string;
  signature: string;
}

export function encryptMessage(
  text: string,
  senderAddress: string,
  recipientAddress: string,
  senderSigningKey: FixedBuf<4032>,
  senderSigningPubKeyHex: string,
  senderEncapKey: FixedBuf<1184>,
  recipientEncapKey: FixedBuf<1184>,
  recipientEncapPubKeyHex: string,
): EncryptedMessage {
  const content = JSON.stringify({ version: 1, type: "text", text });
  const plaintext = WebBuf.fromUtf8(content);
  const aad = buildMessageAad(senderAddress, recipientAddress);
  const recipientCt = aesgcmMlkemEncrypt(recipientEncapKey, plaintext, aad);
  const senderCt = aesgcmMlkemEncrypt(senderEncapKey, plaintext, aad);
  const envelope = buildSignedEnvelope(
    senderAddress,
    recipientAddress,
    senderSigningPubKeyHex,
    recipientEncapPubKeyHex,
    recipientCt,
    senderCt,
  );
  const sig = mlDsa65Sign(senderSigningKey, envelope);
  return {
    recipientCiphertext: recipientCt.toHex(),
    senderCiphertext: senderCt.toHex(),
    signature: sig.buf.toHex(),
  };
}

export function encryptSecretMessage(
  secret: SecretPayload,
  senderAddress: string,
  recipientAddress: string,
  senderSigningKey: FixedBuf<4032>,
  senderSigningPubKeyHex: string,
  senderEncapKey: FixedBuf<1184>,
  recipientEncapKey: FixedBuf<1184>,
  recipientEncapPubKeyHex: string,
): EncryptedMessage {
  const content = JSON.stringify({ version: 1, type: "secret", secret });
  const plaintext = WebBuf.fromUtf8(content);
  const aad = buildMessageAad(senderAddress, recipientAddress);
  const recipientCt = aesgcmMlkemEncrypt(recipientEncapKey, plaintext, aad);
  const senderCt = aesgcmMlkemEncrypt(senderEncapKey, plaintext, aad);
  const envelope = buildSignedEnvelope(
    senderAddress,
    recipientAddress,
    senderSigningPubKeyHex,
    recipientEncapPubKeyHex,
    recipientCt,
    senderCt,
  );
  const sig = mlDsa65Sign(senderSigningKey, envelope);
  return {
    recipientCiphertext: recipientCt.toHex(),
    senderCiphertext: senderCt.toHex(),
    signature: sig.buf.toHex(),
  };
}

// --- Verify ---

export function verifyMessageSignature(
  senderAddress: string,
  recipientAddress: string,
  senderSigningPubKeyHex: string,
  recipientEncapPubKeyHex: string,
  recipientCiphertextHex: string,
  senderCiphertextHex: string,
  signatureHex: string,
): boolean {
  const envelope = buildSignedEnvelope(
    senderAddress,
    recipientAddress,
    senderSigningPubKeyHex,
    recipientEncapPubKeyHex,
    WebBuf.fromHex(recipientCiphertextHex),
    WebBuf.fromHex(senderCiphertextHex),
  );
  const verifyingKey = FixedBuf.fromHex(1952, senderSigningPubKeyHex);
  const signature = FixedBuf.fromHex(3309, signatureHex);
  return mlDsa65Verify(verifyingKey, envelope, signature);
}

// --- Decrypt ---

export function decryptMessageContent(
  encryptedHex: string,
  decapKey: FixedBuf<2400>,
  senderAddress: string,
  recipientAddress: string,
): MessageContent {
  const aad = buildMessageAad(senderAddress, recipientAddress);
  const decrypted = aesgcmMlkemDecrypt(
    decapKey,
    WebBuf.fromHex(encryptedHex),
    aad,
  );
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
