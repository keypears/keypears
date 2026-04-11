import { blake3Hash } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { sharedSecret } from "@webbuf/secp256k1";
import { acb3Encrypt, acb3Decrypt } from "@webbuf/acb3";
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

export function computeMessageKey(
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): FixedBuf<32> {
  const ecdhPoint = sharedSecret(myPrivKey, theirPubKey);
  return blake3Hash(ecdhPoint.buf);
}

// --- Encrypt ---

export function encryptMessage(
  text: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): string {
  const key = computeMessageKey(myPrivKey, theirPubKey);
  const content = JSON.stringify({ version: 1, type: "text", text });
  const encrypted = acb3Encrypt(WebBuf.fromUtf8(content), key);
  return encrypted.toHex();
}

export function encryptSecretMessage(
  secret: SecretPayload,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): string {
  const key = computeMessageKey(myPrivKey, theirPubKey);
  const content = JSON.stringify({ version: 1, type: "secret", secret });
  const encrypted = acb3Encrypt(WebBuf.fromUtf8(content), key);
  return encrypted.toHex();
}

// --- Decrypt ---

export function decryptMessageContent(
  encryptedHex: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): MessageContent {
  const key = computeMessageKey(myPrivKey, theirPubKey);
  const decrypted = acb3Decrypt(WebBuf.fromHex(encryptedHex), key);
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
export function decryptMessage(
  encryptedHex: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): string {
  const content = decryptMessageContent(encryptedHex, myPrivKey, theirPubKey);
  if (content.type !== "text") throw new Error("Not a text message");
  return content.text;
}
