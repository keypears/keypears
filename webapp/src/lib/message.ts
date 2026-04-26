import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import {
  aesgcmX25519dhMlkemEncrypt,
  aesgcmX25519dhMlkemDecrypt,
} from "@webbuf/aesgcm-x25519dh-mlkem";
import {
  sigEd25519MldsaSign,
  sigEd25519MldsaVerify,
} from "@webbuf/sig-ed25519-mldsa";
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
  senderEd25519PubKey: WebBuf,
  senderSigningPubKey: WebBuf,
  senderX25519PubKey: WebBuf,
  recipientX25519PubKey: WebBuf,
  recipientEncapPubKey: WebBuf,
  recipientCiphertext: WebBuf,
  senderCiphertext: WebBuf,
): WebBuf {
  return WebBuf.concat([
    lengthPrefix(ENVELOPE_DOMAIN),
    lengthPrefix(WebBuf.fromUtf8(senderAddress)),
    lengthPrefix(WebBuf.fromUtf8(recipientAddress)),
    lengthPrefix(senderEd25519PubKey),
    lengthPrefix(senderSigningPubKey),
    lengthPrefix(senderX25519PubKey),
    lengthPrefix(recipientX25519PubKey),
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
  senderEd25519Key: FixedBuf<32>,
  senderEd25519PubKey: WebBuf,
  senderSigningKey: FixedBuf<4032>,
  senderSigningPubKey: WebBuf,
  senderX25519Key: FixedBuf<32>,
  senderX25519PubKey: WebBuf,
  senderEncapKey: FixedBuf<1184>,
  recipientX25519PubKey: WebBuf,
  recipientEncapKey: FixedBuf<1184>,
  recipientEncapPubKey: WebBuf,
): EncryptedMessage {
  const content = JSON.stringify({ version: 1, type: "text", text });
  const plaintext = WebBuf.fromUtf8(content);
  const aad = buildMessageAad(senderAddress, recipientAddress);
  const recipientCt = aesgcmX25519dhMlkemEncrypt(
    senderX25519Key,
    FixedBuf.fromBuf(32, recipientX25519PubKey),
    recipientEncapKey,
    plaintext,
    aad,
  );
  const senderCt = aesgcmX25519dhMlkemEncrypt(
    senderX25519Key,
    FixedBuf.fromBuf(32, senderX25519PubKey),
    senderEncapKey,
    plaintext,
    aad,
  );
  const envelope = buildSignedEnvelope(
    senderAddress,
    recipientAddress,
    senderEd25519PubKey,
    senderSigningPubKey,
    senderX25519PubKey,
    recipientX25519PubKey,
    recipientEncapPubKey,
    recipientCt,
    senderCt,
  );
  const sig = sigEd25519MldsaSign(senderEd25519Key, senderSigningKey, envelope);
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
  senderEd25519Key: FixedBuf<32>,
  senderEd25519PubKey: WebBuf,
  senderSigningKey: FixedBuf<4032>,
  senderSigningPubKey: WebBuf,
  senderX25519Key: FixedBuf<32>,
  senderX25519PubKey: WebBuf,
  senderEncapKey: FixedBuf<1184>,
  recipientX25519PubKey: WebBuf,
  recipientEncapKey: FixedBuf<1184>,
  recipientEncapPubKey: WebBuf,
): EncryptedMessage {
  const content = JSON.stringify({ version: 1, type: "secret", secret });
  const plaintext = WebBuf.fromUtf8(content);
  const aad = buildMessageAad(senderAddress, recipientAddress);
  const recipientCt = aesgcmX25519dhMlkemEncrypt(
    senderX25519Key,
    FixedBuf.fromBuf(32, recipientX25519PubKey),
    recipientEncapKey,
    plaintext,
    aad,
  );
  const senderCt = aesgcmX25519dhMlkemEncrypt(
    senderX25519Key,
    FixedBuf.fromBuf(32, senderX25519PubKey),
    senderEncapKey,
    plaintext,
    aad,
  );
  const envelope = buildSignedEnvelope(
    senderAddress,
    recipientAddress,
    senderEd25519PubKey,
    senderSigningPubKey,
    senderX25519PubKey,
    recipientX25519PubKey,
    recipientEncapPubKey,
    recipientCt,
    senderCt,
  );
  const sig = sigEd25519MldsaSign(senderEd25519Key, senderSigningKey, envelope);
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
  senderEd25519PubKey: WebBuf,
  senderSigningPubKey: WebBuf,
  senderX25519PubKey: WebBuf,
  recipientX25519PubKey: WebBuf,
  recipientEncapPubKey: WebBuf,
  recipientCiphertext: WebBuf,
  senderCiphertext: WebBuf,
  signature: WebBuf,
): boolean {
  const envelope = buildSignedEnvelope(
    senderAddress,
    recipientAddress,
    senderEd25519PubKey,
    senderSigningPubKey,
    senderX25519PubKey,
    recipientX25519PubKey,
    recipientEncapPubKey,
    recipientCiphertext,
    senderCiphertext,
  );
  const ed25519Pub = FixedBuf.fromBuf(32, senderEd25519PubKey);
  const verifyingKey = FixedBuf.fromBuf(1952, senderSigningPubKey);
  const sig = FixedBuf.fromBuf(3374, signature);
  return sigEd25519MldsaVerify(ed25519Pub, verifyingKey, envelope, sig);
}

// --- Decrypt ---

export function decryptMessageContent(
  encrypted: WebBuf,
  myX25519Key: FixedBuf<32>,
  senderX25519PubKey: WebBuf,
  decapKey: FixedBuf<2400>,
  senderAddress: string,
  recipientAddress: string,
): MessageContent {
  const aad = buildMessageAad(senderAddress, recipientAddress);
  const decrypted = aesgcmX25519dhMlkemDecrypt(
    myX25519Key,
    FixedBuf.fromBuf(32, senderX25519PubKey),
    decapKey,
    encrypted,
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
