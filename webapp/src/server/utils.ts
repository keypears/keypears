import { blake3Hash } from "@webbuf/blake3";
import { WebBuf } from "@webbuf/webbuf";
import { uuidv7 } from "uuidv7";

export function newId(): string {
  return uuidv7();
}

export function hashToken(token: string): string {
  return blake3Hash(WebBuf.fromUtf8(token)).buf.toHex();
}
