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

// --- Encrypt ---

export interface EncryptedMessage {
  recipientCiphertext: string;
  senderCiphertext: string;
  signature: string;
}

export function encryptMessage(
  text: string,
  senderSigningKey: FixedBuf<4032>,
  senderEncapKey: FixedBuf<1184>,
  recipientEncapKey: FixedBuf<1184>,
): EncryptedMessage {
  const content = JSON.stringify({ version: 1, type: "text", text });
  const plaintext = WebBuf.fromUtf8(content);
  const recipientCt = aesgcmMlkemEncrypt(recipientEncapKey, plaintext);
  const senderCt = aesgcmMlkemEncrypt(senderEncapKey, plaintext);
  const sig = mlDsa65Sign(senderSigningKey, recipientCt);
  return {
    recipientCiphertext: recipientCt.toHex(),
    senderCiphertext: senderCt.toHex(),
    signature: sig.buf.toHex(),
  };
}

export function encryptSecretMessage(
  secret: SecretPayload,
  senderSigningKey: FixedBuf<4032>,
  senderEncapKey: FixedBuf<1184>,
  recipientEncapKey: FixedBuf<1184>,
): EncryptedMessage {
  const content = JSON.stringify({ version: 1, type: "secret", secret });
  const plaintext = WebBuf.fromUtf8(content);
  const recipientCt = aesgcmMlkemEncrypt(recipientEncapKey, plaintext);
  const senderCt = aesgcmMlkemEncrypt(senderEncapKey, plaintext);
  const sig = mlDsa65Sign(senderSigningKey, recipientCt);
  return {
    recipientCiphertext: recipientCt.toHex(),
    senderCiphertext: senderCt.toHex(),
    signature: sig.buf.toHex(),
  };
}

// --- Verify ---

export function verifyMessageSignature(
  senderSigningPubKeyHex: string,
  recipientCiphertextHex: string,
  signatureHex: string,
): boolean {
  const verifyingKey = FixedBuf.fromHex(1952, senderSigningPubKeyHex);
  const recipientCt = WebBuf.fromHex(recipientCiphertextHex);
  const signature = FixedBuf.fromHex(3309, signatureHex);
  return mlDsa65Verify(verifyingKey, recipientCt, signature);
}

// --- Decrypt ---

export function decryptMessageContent(
  encryptedHex: string,
  decapKey: FixedBuf<2400>,
): MessageContent {
  const decrypted = aesgcmMlkemDecrypt(decapKey, WebBuf.fromHex(encryptedHex));
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
