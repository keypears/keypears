import { sha256Hash } from "@webbuf/sha256";
import { WebBuf } from "@webbuf/webbuf";
import { uuidv7 } from "uuidv7";

export function newId(): string {
  return uuidv7();
}

export function hashToken(token: string): string {
  return sha256Hash(WebBuf.fromUtf8(token)).buf.toHex();
}
