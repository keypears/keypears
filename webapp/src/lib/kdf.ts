import { blake3Mac } from "@webbuf/blake3";
import type { FixedBuf } from "@webbuf/fixedbuf";
import type { WebBuf } from "@webbuf/webbuf";

/**
 * BLAKE3-based PBKDF. Iterates blake3Mac(salt, data) for the given number
 * of rounds. Used for both client-side key derivation and server-side
 * login key hashing.
 */
export function blake3Pbkdf(
  password: WebBuf,
  salt: FixedBuf<32>,
  rounds: number,
): FixedBuf<32> {
  let result = blake3Mac(salt, password);
  for (let i = 1; i < rounds; i++) {
    result = blake3Mac(salt, result.buf);
  }
  return result;
}
