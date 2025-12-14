import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
// MAX_TARGET is 2^256 - 1 (all bits set to 1)
// This represents the easiest possible target (any hash is valid)
const MAX_TARGET = (1n << 256n) - 1n;
/**
 * Convert a difficulty number to a 256-bit target.
 * Higher difficulty = lower target = harder to mine.
 *
 * target = MAX_TARGET / difficulty
 *
 * @param difficulty - The difficulty as a bigint (must be > 0)
 * @returns 32-byte target in big-endian format
 */
export function targetFromDifficulty(difficulty) {
  if (difficulty <= 0n) {
    throw new Error("Difficulty must be greater than 0");
  }
  const target = MAX_TARGET / difficulty;
  // Convert bigint to 32-byte big-endian buffer
  const buf = WebBuf.alloc(32);
  let remaining = target;
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(remaining & 0xffn);
    remaining = remaining >> 8n;
  }
  return FixedBuf.fromBuf(32, buf);
}
/**
 * Convert a 256-bit target to a difficulty number.
 * Lower target = higher difficulty.
 *
 * difficulty = MAX_TARGET / target
 *
 * @param target - 32-byte target in big-endian format
 * @returns The difficulty as a bigint
 */
export function difficultyFromTarget(target) {
  // Convert 32-byte big-endian buffer to bigint
  let targetBn = 0n;
  for (let i = 0; i < 32; i++) {
    const byte = target.buf[i];
    if (byte === undefined) {
      throw new Error(`Target byte at index ${i} is undefined`);
    }
    targetBn = (targetBn << 8n) | BigInt(byte);
  }
  if (targetBn === 0n) {
    throw new Error("Target cannot be zero");
  }
  return MAX_TARGET / targetBn;
}
/**
 * Check if a hash meets the target (hash < target).
 *
 * @param hash - 32-byte hash in big-endian format
 * @param target - 32-byte target in big-endian format
 * @returns true if hash < target (valid proof of work)
 */
export function hashMeetsTarget(hash, target) {
  // Compare byte by byte from most significant
  for (let i = 0; i < 32; i++) {
    const hashByte = hash.buf[i];
    const targetByte = target.buf[i];
    if (hashByte === undefined || targetByte === undefined) {
      throw new Error(`Byte at index ${i} is undefined`);
    }
    if (hashByte < targetByte) {
      return true;
    }
    if (hashByte > targetByte) {
      return false;
    }
  }
  // Equal - hash must be strictly less than target
  return false;
}
