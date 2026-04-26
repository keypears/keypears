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
import {
  decryptEd25519Key,
  decryptX25519Key,
  decryptSigningKey,
  getCachedEncryptionKey,
} from "./auth";
import { getMyActiveEncryptedKey } from "~/server/message.functions";

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

// --- Outbound message helpers ---
// These convert WebBuf crypto results to the hex wire format expected by
// sendMessage, so route components don't need to thread 14 positional args.

export interface SenderKeys {
  ed25519Key: FixedBuf<32>;
  ed25519PubKey: WebBuf;
  signingKey: FixedBuf<4032>;
  signingPubKey: WebBuf;
  x25519Key: FixedBuf<32>;
  x25519PubKey: WebBuf;
  encapPubKey: FixedBuf<1184>;
}

export interface RecipientKeys {
  x25519PubKey: WebBuf;
  encapKey: FixedBuf<1184>;
  encapPubKey: WebBuf;
  keyNumber: number;
}

export interface OutboundMessage {
  recipientAddress: string;
  encryptedContent: string;
  senderEncryptedContent: string;
  senderEd25519PubKey: string;
  senderX25519PubKey: string;
  senderMldsaPubKey: string;
  recipientX25519PubKey: string;
  recipientMlkemPubKey: string;
  senderSignature: string;
  recipientKeyNumber: number;
}

/**
 * Fetch the user's active encrypted key set, decrypt the private keys with
 * the cached encryption key, and return a SenderKeys bundle suitable for
 * prepareOutboundMessage. Throws if the user has no cached encryption key
 * (login required).
 */
export async function loadActiveSenderKeys(): Promise<SenderKeys> {
  const encryptionKey = getCachedEncryptionKey();
  if (!encryptionKey) throw new Error("Please log in again");
  const k = await getMyActiveEncryptedKey();
  const [ed25519Key, x25519Key, signingKey] = await Promise.all([
    decryptEd25519Key(WebBuf.fromHex(k.encryptedEd25519Key), encryptionKey),
    decryptX25519Key(WebBuf.fromHex(k.encryptedX25519Key), encryptionKey),
    decryptSigningKey(WebBuf.fromHex(k.encryptedSigningKey), encryptionKey),
  ]);
  return {
    ed25519Key,
    ed25519PubKey: WebBuf.fromHex(k.ed25519PublicKey),
    signingKey,
    signingPubKey: WebBuf.fromHex(k.signingPublicKey),
    x25519Key,
    x25519PubKey: WebBuf.fromHex(k.x25519PublicKey),
    encapPubKey: FixedBuf.fromHex(1184, k.encapPublicKey),
  };
}

export function prepareOutboundMessage(
  text: string,
  senderAddress: string,
  recipientAddress: string,
  sender: SenderKeys,
  recipient: RecipientKeys,
): OutboundMessage {
  const { recipientCiphertext, senderCiphertext, signature } = encryptMessage(
    text,
    senderAddress,
    recipientAddress,
    sender.ed25519Key,
    sender.ed25519PubKey,
    sender.signingKey,
    sender.signingPubKey,
    sender.x25519Key,
    sender.x25519PubKey,
    sender.encapPubKey,
    recipient.x25519PubKey,
    recipient.encapKey,
    recipient.encapPubKey,
  );
  return {
    recipientAddress,
    encryptedContent: recipientCiphertext.toHex(),
    senderEncryptedContent: senderCiphertext.toHex(),
    senderEd25519PubKey: sender.ed25519PubKey.toHex(),
    senderX25519PubKey: sender.x25519PubKey.toHex(),
    senderMldsaPubKey: sender.signingPubKey.toHex(),
    recipientX25519PubKey: recipient.x25519PubKey.toHex(),
    recipientMlkemPubKey: recipient.encapPubKey.toHex(),
    senderSignature: signature.toHex(),
    recipientKeyNumber: recipient.keyNumber,
  };
}

export function prepareOutboundSecretMessage(
  secret: SecretPayload,
  senderAddress: string,
  recipientAddress: string,
  sender: SenderKeys,
  recipient: RecipientKeys,
): OutboundMessage {
  const { recipientCiphertext, senderCiphertext, signature } =
    encryptSecretMessage(
      secret,
      senderAddress,
      recipientAddress,
      sender.ed25519Key,
      sender.ed25519PubKey,
      sender.signingKey,
      sender.signingPubKey,
      sender.x25519Key,
      sender.x25519PubKey,
      sender.encapPubKey,
      recipient.x25519PubKey,
      recipient.encapKey,
      recipient.encapPubKey,
    );
  return {
    recipientAddress,
    encryptedContent: recipientCiphertext.toHex(),
    senderEncryptedContent: senderCiphertext.toHex(),
    senderEd25519PubKey: sender.ed25519PubKey.toHex(),
    senderX25519PubKey: sender.x25519PubKey.toHex(),
    senderMldsaPubKey: sender.signingPubKey.toHex(),
    recipientX25519PubKey: recipient.x25519PubKey.toHex(),
    recipientMlkemPubKey: recipient.encapPubKey.toHex(),
    senderSignature: signature.toHex(),
    recipientKeyNumber: recipient.keyNumber,
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
