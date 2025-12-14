import { FixedBuf } from "@webbuf/fixedbuf";
/**
 * Compute the matmul work for a 64-byte header.
 * This is the ASIC-resistant computation (same algorithm as 217a).
 */
export declare function matmulWork(header: FixedBuf<64>): FixedBuf<32>;
/**
 * Compute the elementary iteration for a 64-byte header.
 * Returns the final PoW hash (double-hash of the matmul result).
 */
export declare function elementaryIteration(header: FixedBuf<64>): FixedBuf<32>;
/**
 * Insert a 4-byte nonce into bytes 28-31 of the header.
 * This is used for GPU iteration where the GPU increments the last 4 bytes.
 */
export declare function insertNonce(
  header: FixedBuf<64>,
  nonce: number,
): FixedBuf<64>;
/**
 * Set the full 32-byte nonce (bytes 0-31) of the header.
 */
export declare function setNonce(
  header: FixedBuf<64>,
  nonce: FixedBuf<32>,
): FixedBuf<64>;
