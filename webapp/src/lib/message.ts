import { blake3Hash } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { sharedSecret } from "@webbuf/secp256k1";
import { acs2Encrypt, acs2Decrypt } from "@webbuf/acs2";
import { z } from "zod";

const MessageContentSchema = z.object({
  version: z.number(),
  type: z.literal("text"),
  text: z.string(),
});

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

export function decryptMessage(
  encryptedHex: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): string {
  const key = computeMessageKey(myPrivKey, theirPubKey);
  const decrypted = acs2Decrypt(WebBuf.fromHex(encryptedHex), key);
  const parsed = MessageContentSchema.parse(JSON.parse(decrypted.toUtf8()));
  return parsed.text;
}
