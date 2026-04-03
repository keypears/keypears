import { sha256Hmac } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import {
  Pow5_64b_Wasm,
  hashMeetsTarget,
  targetFromDifficulty,
} from "@keypears/pow5";

const CHALLENGE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
export const REGISTRATION_DIFFICULTY = 700_000n;
export const LOGIN_DIFFICULTY = 70_000n;
const NONCE_SIZE = 32; // bytes 0-31 are nonce
const HEADER_SIZE = 64;

function getSecret(): FixedBuf<32> {
  const hex = process.env.POW_SECRET;
  if (!hex) throw new Error("POW_SECRET env var is required");
  return FixedBuf.fromHex(32, hex);
}

function signChallenge(
  header: WebBuf,
  target: WebBuf,
  expiresAt: number,
): FixedBuf<32> {
  const secret = getSecret();
  // Extract non-nonce bytes (bytes 32-63) for signing
  const nonNonce = header.slice(NONCE_SIZE);
  const expiresAtBuf = WebBuf.alloc(8);
  new DataView(expiresAtBuf.buffer).setBigUint64(0, BigInt(expiresAt));
  const payload = WebBuf.from([...nonNonce, ...target, ...expiresAtBuf]);
  return sha256Hmac(secret.buf, payload);
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
  // Check expiry
  if (Date.now() > expiresAt) {
    return { valid: false, message: "Challenge expired" };
  }

  const solvedHeader = WebBuf.fromHex(solvedHeaderHex);
  const target = WebBuf.fromHex(targetHex);
  const signature = FixedBuf.fromHex(32, signatureHex);

  // Verify signature (proves server issued this challenge)
  const expectedSig = signChallenge(solvedHeader, target, expiresAt);
  if (signature.buf.toHex() !== expectedSig.buf.toHex()) {
    return { valid: false, message: "Invalid signature" };
  }

  // Verify header size
  if (solvedHeader.length !== HEADER_SIZE) {
    return { valid: false, message: "Invalid header size" };
  }

  // Compute hash and verify it meets target
  const hash = Pow5_64b_Wasm.elementaryIteration(
    FixedBuf.fromBuf(HEADER_SIZE as 64, solvedHeader),
  );
  const targetFixed = FixedBuf.fromBuf(32, target);

  if (!hashMeetsTarget(hash, targetFixed)) {
    return { valid: false, message: "Hash does not meet target" };
  }

  return { valid: true };
}
