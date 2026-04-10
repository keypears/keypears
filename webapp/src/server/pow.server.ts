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
export const MESSAGE_DIFFICULTY = 7_000_000n;
export const MIN_CHANNEL_DIFFICULTY = 7_000_000n;
export const MIN_MESSAGE_DIFFICULTY = 7_000_000n;
const NONCE_SIZE = 32; // bytes 0-31 are nonce
const HEADER_SIZE = 64 as const;

function signChallenge(
  header: WebBuf,
  target: WebBuf,
  expiresAt: number,
  senderAddress?: string,
  recipientAddress?: string,
): FixedBuf<32> {
  const secret = getPowSigningKey();
  const nonNonce = header.slice(NONCE_SIZE);
  const expiresAtBuf = WebBuf.alloc(8);
  new DataView(expiresAtBuf.buffer).setBigUint64(0, BigInt(expiresAt));
  const parts: number[] = [
    ...nonNonce,
    ...target,
    ...expiresAtBuf,
  ];
  if (senderAddress) {
    parts.push(...WebBuf.fromUtf8(senderAddress));
  }
  if (recipientAddress) {
    parts.push(...WebBuf.fromUtf8(recipientAddress));
  }
  return blake3Mac(secret, WebBuf.from(parts));
}

export function createPowChallenge(
  difficulty?: bigint,
  senderAddress?: string,
  recipientAddress?: string,
) {
  const diff = difficulty ?? REGISTRATION_DIFFICULTY;
  const header = FixedBuf.fromRandom(HEADER_SIZE);
  const target = targetFromDifficulty(diff);
  const expiresAt = Date.now() + CHALLENGE_EXPIRY_MS;
  const signature = signChallenge(
    header.buf,
    target.buf,
    expiresAt,
    senderAddress,
    recipientAddress,
  );

  return {
    header: header.buf.toHex(),
    target: target.buf.toHex(),
    expiresAt,
    difficulty: Number(diff),
    signature: signature.buf.toHex(),
    senderAddress,
    recipientAddress,
  };
}

export function verifyPowSolution(
  solvedHeaderHex: string,
  targetHex: string,
  expiresAt: number,
  signatureHex: string,
  senderAddress?: string,
  recipientAddress?: string,
): { valid: boolean; message?: string } {
  // Validate input lengths before parsing to prevent memory exhaustion
  if (solvedHeaderHex.length !== HEADER_SIZE * 2) {
    return { valid: false, message: "Invalid header size" };
  }
  if (targetHex.length !== 64) {
    return { valid: false, message: "Invalid target size" };
  }
  if (signatureHex.length !== 64) {
    return { valid: false, message: "Invalid signature size" };
  }

  if (Date.now() > expiresAt) {
    return { valid: false, message: "Challenge expired" };
  }

  const solvedHeader = WebBuf.fromHex(solvedHeaderHex);
  const target = WebBuf.fromHex(targetHex);
  const signature = FixedBuf.fromHex(32, signatureHex);

  const expectedSig = signChallenge(
    solvedHeader,
    target,
    expiresAt,
    senderAddress,
    recipientAddress,
  );
  if (signature.buf.toHex() !== expectedSig.buf.toHex()) {
    return { valid: false, message: "Invalid signature" };
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
