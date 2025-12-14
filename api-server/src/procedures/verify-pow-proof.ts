import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import * as Pow5_64b_Wasm from "@keypears/pow5/dist/pow5-64b-wasm.js";
import * as Pow5_217a_Wasm from "@keypears/pow5/dist/pow5-217a-wasm.js";
import {
  targetFromDifficulty,
  hashMeetsTarget,
} from "@keypears/pow5/dist/difficulty.js";
import {
  VerifyPowProofRequestSchema,
  VerifyPowProofResponseSchema,
} from "../zod-schemas.js";
import { base } from "./base.js";

// Same hardcoded difficulty as in get-pow-challenge
const TEST_DIFFICULTY = 256n;

// Header sizes and nonce regions for each algorithm
const HEADER_SIZE_64B = 64;
const HEADER_SIZE_217A = 217;
const NONCE_START_64B = 0;
const NONCE_END_64B = 32;
const NONCE_START_217A = 117;
const NONCE_END_217A = 149;

/**
 * Zero out the nonce region of a header buffer (returns a copy).
 */
function zeroNonceRegion(
  header: WebBuf,
  nonceStart: number,
  nonceEnd: number,
): WebBuf {
  const copy = header.clone();
  for (let i = nonceStart; i < nonceEnd; i++) {
    copy[i] = 0;
  }
  return copy;
}

/**
 * Verify PoW Proof procedure (FOR TESTING ONLY - NOT SECURE)
 *
 * Verifies that the client computed a valid proof-of-work.
 * Supports both pow5-64b and pow5-217a algorithms.
 *
 * Verification steps:
 * 1. Validate header length matches algorithm
 * 2. Zero out nonce region in both headers and compare (must match)
 * 3. Recompute hash and verify it matches provided hash
 * 4. Verify hash meets difficulty target
 *
 * This is NOT secure because:
 * - No challenge storage in database (client sends back original header)
 * - No expiration checking
 * - No rate limiting
 */
export const verifyPowProofProcedure = base
  .input(VerifyPowProofRequestSchema)
  .output(VerifyPowProofResponseSchema)
  .handler(async ({ input }) => {
    const { algorithm, originalHeader, solvedHeader, hash } = input;

    try {
      // Determine expected header size and nonce region based on algorithm
      const expectedSize =
        algorithm === "pow5-64b" ? HEADER_SIZE_64B : HEADER_SIZE_217A;
      const nonceStart =
        algorithm === "pow5-64b" ? NONCE_START_64B : NONCE_START_217A;
      const nonceEnd =
        algorithm === "pow5-64b" ? NONCE_END_64B : NONCE_END_217A;

      // Validate header lengths (hex string length = 2 * byte length)
      const expectedHexLength = expectedSize * 2;
      if (originalHeader.length !== expectedHexLength) {
        return {
          valid: false,
          message: `Original header length invalid: expected ${expectedHexLength} hex chars for ${algorithm}, got ${originalHeader.length}`,
        };
      }
      if (solvedHeader.length !== expectedHexLength) {
        return {
          valid: false,
          message: `Solved header length invalid: expected ${expectedHexLength} hex chars for ${algorithm}, got ${solvedHeader.length}`,
        };
      }

      // Parse hex strings to buffers
      const originalHeaderBuf = WebBuf.fromHex(originalHeader);
      const solvedHeaderBuf = WebBuf.fromHex(solvedHeader);
      const hashBuf = FixedBuf.fromHex(32, hash);

      // 1. Zero out nonce regions and compare (non-nonce bytes must match)
      const originalZeroed = zeroNonceRegion(
        originalHeaderBuf,
        nonceStart,
        nonceEnd,
      );
      const solvedZeroed = zeroNonceRegion(
        solvedHeaderBuf,
        nonceStart,
        nonceEnd,
      );

      if (!originalZeroed.equals(solvedZeroed)) {
        return {
          valid: false,
          message: "Non-nonce bytes do not match between original and solved headers",
        };
      }

      // 2. Recompute the hash and verify it matches
      let computedHash: FixedBuf<32>;
      if (algorithm === "pow5-64b") {
        const solvedFixed = FixedBuf.fromBuf(64, solvedHeaderBuf);
        computedHash = Pow5_64b_Wasm.elementaryIteration(solvedFixed);
      } else {
        const solvedFixed = FixedBuf.fromBuf(217, solvedHeaderBuf);
        computedHash = Pow5_217a_Wasm.elementaryIteration(solvedFixed);
      }

      if (computedHash.buf.toHex() !== hashBuf.buf.toHex()) {
        return {
          valid: false,
          message: "Hash does not match computed value",
        };
      }

      // 3. Verify hash meets target
      const target = targetFromDifficulty(TEST_DIFFICULTY);
      if (!hashMeetsTarget(hashBuf, target)) {
        return {
          valid: false,
          message: "Hash does not meet difficulty target",
        };
      }

      return {
        valid: true,
        message: `Proof of work verified successfully (${algorithm})!`,
      };
    } catch (error) {
      return {
        valid: false,
        message: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
