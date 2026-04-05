import { blake3Mac } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import {
  Pow5_64b_Wasm,
  hashMeetsTarget,
  targetFromDifficulty,
} from "@keypears/pow5";
import { getPowSigningKey } from "~/lib/config";

const CHALLENGE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
export const REGISTRATION_DIFFICULTY = 70_000_000n;
export const CHANNEL_DIFFICULTY = 70_000_000n;
export const LOGIN_DIFFICULTY = 7_000_000n;
const NONCE_SIZE = 32; // bytes 0-31 are nonce
const HEADER_SIZE = 64 as const;

function signChallenge(
  header: WebBuf,
  target: WebBuf,
  expiresAt: number,
): FixedBuf<32> {
  const secret = getPowSigningKey();
  const nonNonce = header.slice(NONCE_SIZE);
  const expiresAtBuf = WebBuf.alloc(8);
  new DataView(expiresAtBuf.buffer).setBigUint64(0, BigInt(expiresAt));
  const payload = WebBuf.from([...nonNonce, ...target, ...expiresAtBuf]);
  return blake3Mac(secret, payload);
}

export function createPowChallenge(difficulty?: bigint) {
  const diff = difficulty ?? REGISTRATION_DIFFICULTY;
  const header = FixedBuf.fromRandom(HEADER_SIZE);
  const target = targetFromDifficulty(diff);
  const expiresAt = Date.now() + CHALLENGE_EXPIRY_MS;
  const signature = signChallenge(header.buf, target.buf, expiresAt);

  return {
    header: header.buf.toHex(),
    target: target.buf.toHex(),
    expiresAt,
    difficulty: Number(diff),
    signature: signature.buf.toHex(),
  };
}

export function verifyPowSolution(
  solvedHeaderHex: string,
  targetHex: string,
  expiresAt: number,
  signatureHex: string,
): { valid: boolean; message?: string } {
  if (Date.now() > expiresAt) {
    return { valid: false, message: "Challenge expired" };
  }

  const solvedHeader = WebBuf.fromHex(solvedHeaderHex);
  const target = WebBuf.fromHex(targetHex);
  const signature = FixedBuf.fromHex(32, signatureHex);

  const expectedSig = signChallenge(solvedHeader, target, expiresAt);
  if (signature.buf.toHex() !== expectedSig.buf.toHex()) {
    return { valid: false, message: "Invalid signature" };
  }

  if (solvedHeader.length !== HEADER_SIZE) {
    return { valid: false, message: "Invalid header size" };
  }

  const hash = Pow5_64b_Wasm.elementaryIteration(
    FixedBuf.fromBuf(HEADER_SIZE, solvedHeader),
  );
  const targetFixed = FixedBuf.fromBuf(32, target);

  if (!hashMeetsTarget(hash, targetFixed)) {
    return { valid: false, message: "Hash does not meet target" };
  }

  return { valid: true };
}

/**
 * Mine a PoW challenge server-side (WASM, CPU).
 * Used by the sender's server when delivering messages to a remote server.
 */
export function mineChallenge(challenge: {
  header: string;
  target: string;
}): string {
  const headerBuf = FixedBuf.fromHex(64, challenge.header);
  const targetBuf = FixedBuf.fromHex(32, challenge.target);

  let nonce = 0;
  while (true) {
    const nonceBuf = WebBuf.alloc(32);
    let remaining = BigInt(nonce);
    for (let i = 31; i >= 0; i--) {
      nonceBuf[i] = Number(remaining & 0xffn);
      remaining = remaining >> 8n;
    }
    const testHeader = FixedBuf.fromBuf(
      64,
      WebBuf.from([...nonceBuf, ...headerBuf.buf.slice(32)]),
    );
    const hash = Pow5_64b_Wasm.elementaryIteration(testHeader);

    if (hashMeetsTarget(hash, targetBuf)) {
      return testHeader.buf.toHex();
    }

    nonce++;
  }
}
