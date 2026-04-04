import { sha256Hash } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { sharedSecret } from "@webbuf/secp256k1";
import { acs2Encrypt, acs2Decrypt } from "@webbuf/acs2";

export function computeMessageKey(
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): FixedBuf<32> {
  const ecdhPoint = sharedSecret(myPrivKey, theirPubKey);
  return sha256Hash(ecdhPoint.buf);
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
  const parsed = JSON.parse(decrypted.toUtf8()) as {
    version: number;
    type: string;
    text: string;
  };
  return parsed.text;
}
