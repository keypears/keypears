import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { eq } from "drizzle-orm";
import * as Pow5_64b_Wasm from "@keypears/pow5/dist/pow5-64b-wasm.js";
import * as Pow5_217a_Wasm from "@keypears/pow5/dist/pow5-217a-wasm.js";
import { hashMeetsTarget } from "@keypears/pow5/dist/difficulty.js";
import {
  VerifyPowProofRequestSchema,
  VerifyPowProofResponseSchema,
} from "../zod-schemas.js";
import { base } from "./base.js";
import { db } from "../db/index.js";
import { TablePowChallenge } from "../db/schema.js";

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
 * Verify PoW Proof procedure
 *
 * Verifies that the client computed a valid proof-of-work.
 * Supports both pow5-64b and pow5-217a algorithms.
 *
 * Verification steps:
 * 1. Look up challenge by ID from database
 * 2. Check challenge is not expired
 * 3. Check challenge has not been used
 * 4. Zero out nonce region in both headers and compare (must match)
 * 5. Recompute hash and verify it matches provided hash
 * 6. Verify hash meets difficulty target
 * 7. Mark challenge as used
 */
export const verifyPowProofProcedure = base
  .input(VerifyPowProofRequestSchema)
  .output(VerifyPowProofResponseSchema)
  .handler(async ({ input }) => {
    const { challengeId, solvedHeader, hash } = input;

    try {
      // 1. Look up challenge from database
      const [challenge] = await db
        .select()
        .from(TablePowChallenge)
        .where(eq(TablePowChallenge.id, challengeId))
        .limit(1);

      if (!challenge) {
        return {
          valid: false,
          message: "Challenge not found",
        };
      }

      // 2. Check if challenge has expired
      if (new Date() > challenge.expiresAt) {
        return {
          valid: false,
          message: "Challenge has expired",
        };
      }

      // 3. Check if challenge has already been used
      if (challenge.isUsed) {
        return {
          valid: false,
          message: "Challenge has already been used",
        };
      }

      // Get algorithm and original header from database
      const algorithm = challenge.algorithm as "pow5-64b" | "pow5-217a";
      const originalHeader = challenge.header;

      // Determine expected header size and nonce region based on algorithm
      const expectedSize =
        algorithm === "pow5-64b" ? HEADER_SIZE_64B : HEADER_SIZE_217A;
      const nonceStart =
        algorithm === "pow5-64b" ? NONCE_START_64B : NONCE_START_217A;
      const nonceEnd =
        algorithm === "pow5-64b" ? NONCE_END_64B : NONCE_END_217A;

      // Validate solved header length (hex string length = 2 * byte length)
      const expectedHexLength = expectedSize * 2;
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
      const targetBuf = FixedBuf.fromHex(32, challenge.target);

      // 4. Zero out nonce regions and compare (non-nonce bytes must match)
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
          message:
            "Non-nonce bytes do not match between original and solved headers",
        };
      }

      // 5. Recompute the hash and verify it matches
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

      // 6. Verify hash meets target
      if (!hashMeetsTarget(hashBuf, targetBuf)) {
        return {
          valid: false,
          message: "Hash does not meet difficulty target",
        };
      }

      // 7. Mark challenge as used (prevent replay)
      await db
        .update(TablePowChallenge)
        .set({ isUsed: true })
        .where(eq(TablePowChallenge.id, challengeId));

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
