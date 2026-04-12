import { sha256Hash } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { p256SharedSecret } from "@webbuf/p256";
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

export function computeMessageKey(
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): FixedBuf<32> {
  const ecdhPoint = p256SharedSecret(myPrivKey, theirPubKey);
  return sha256Hash(ecdhPoint.buf);
}

// --- Encrypt ---

export async function encryptMessage(
  text: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): Promise<string> {
  const key = computeMessageKey(myPrivKey, theirPubKey);
  const content = JSON.stringify({ version: 1, type: "text", text });
  const encrypted = await aesgcmEncryptNative(WebBuf.fromUtf8(content), key);
  return encrypted.toHex();
}

export async function encryptSecretMessage(
  secret: SecretPayload,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): Promise<string> {
  const key = computeMessageKey(myPrivKey, theirPubKey);
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
  const key = computeMessageKey(myPrivKey, theirPubKey);
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
