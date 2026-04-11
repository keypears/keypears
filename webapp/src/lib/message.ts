import { blake3Hash } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { sharedSecret } from "@webbuf/secp256k1";
import { acs2Encrypt, acs2Decrypt } from "@webbuf/acs2";
import { z } from "zod";

const TextMessageSchema = z.object({
  version: z.number(),
  type: z.literal("text"),
  text: z.string(),
});

const SecretMessageSchema = z.object({
  version: z.number(),
  type: z.literal("secret"),
  secret: z.object({
    name: z.string(),
    secretType: z.string(),
    fields: z.record(z.string()),
  }),
});

const MessageContentSchema = z.discriminatedUnion("type", [
  TextMessageSchema,
  SecretMessageSchema,
]);

export type MessageContent = z.infer<typeof MessageContentSchema>;
export type SecretPayload = z.infer<typeof SecretMessageSchema>["secret"];

export function computeMessageKey(
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): FixedBuf<32> {
  const ecdhPoint = sharedSecret(myPrivKey, theirPubKey);
  return blake3Hash(ecdhPoint.buf);
}

export function encryptMessage(
  text: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): string {
  const key = computeMessageKey(myPrivKey, theirPubKey);
  const content = JSON.stringify({ version: 1, type: "text", text });
  const encrypted = acs2Encrypt(WebBuf.fromUtf8(content), key);
  return encrypted.toHex();
}

export function encryptSecretMessage(
  secret: SecretPayload,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): string {
  const key = computeMessageKey(myPrivKey, theirPubKey);
  const content = JSON.stringify({ version: 1, type: "secret", secret });
  const encrypted = acs2Encrypt(WebBuf.fromUtf8(content), key);
  return encrypted.toHex();
}

export function decryptMessageContent(
  encryptedHex: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): MessageContent {
  const key = computeMessageKey(myPrivKey, theirPubKey);
  const decrypted = acs2Decrypt(WebBuf.fromHex(encryptedHex), key);
  return MessageContentSchema.parse(JSON.parse(decrypted.toUtf8()));
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
