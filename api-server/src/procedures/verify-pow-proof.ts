import { FixedBuf } from "@webbuf/fixedbuf";
import * as Pow5_64b_Wasm from "@keypears/pow5/dist/pow5-64b-wasm.js";
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

/**
 * Verify PoW Proof procedure (FOR TESTING ONLY - NOT SECURE)
 *
 * Verifies that the client computed a valid proof-of-work.
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
    const { originalHeader, solvedHeader, hash } = input;

    try {
      // Parse hex strings to buffers
      const originalHeaderBuf = FixedBuf.fromHex(64, originalHeader);
      const solvedHeaderBuf = FixedBuf.fromHex(64, solvedHeader);
      const hashBuf = FixedBuf.fromHex(32, hash);

      // 1. Verify challenge bytes match (bytes 32-63)
      for (let i = 32; i < 64; i++) {
        if (originalHeaderBuf.buf[i] !== solvedHeaderBuf.buf[i]) {
          return {
            valid: false,
            message: "Challenge bytes do not match",
          };
        }
      }

      // 2. Recompute the hash and verify it matches
      const computedHash = Pow5_64b_Wasm.elementaryIteration(solvedHeaderBuf);
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
        message: "Proof of work verified successfully!",
      };
    } catch (error) {
      return {
        valid: false,
        message: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
