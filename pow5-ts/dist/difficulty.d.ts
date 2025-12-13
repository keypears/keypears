import { FixedBuf } from "@webbuf/fixedbuf";
/**
 * Convert a difficulty number to a 256-bit target.
 * Higher difficulty = lower target = harder to mine.
 *
 * target = MAX_TARGET / difficulty
 *
 * @param difficulty - The difficulty as a bigint (must be > 0)
 * @returns 32-byte target in big-endian format
 */
export declare function targetFromDifficulty(difficulty: bigint): FixedBuf<32>;
/**
 * Convert a 256-bit target to a difficulty number.
 * Lower target = higher difficulty.
 *
 * difficulty = MAX_TARGET / target
 *
 * @param target - 32-byte target in big-endian format
 * @returns The difficulty as a bigint
 */
export declare function difficultyFromTarget(target: FixedBuf<32>): bigint;
/**
 * Check if a hash meets the target (hash < target).
 *
 * @param hash - 32-byte hash in big-endian format
 * @param target - 32-byte target in big-endian format
 * @returns true if hash < target (valid proof of work)
 */
export declare function hashMeetsTarget(hash: FixedBuf<32>, target: FixedBuf<32>): boolean;
