import {
  VerifyPowProofRequestSchema,
  VerifyPowProofResponseSchema,
} from "../zod-schemas.js";
import { base } from "./base.js";
import { verifyPowProof } from "../lib/verify-pow.js";

/**
 * Verify PoW Proof procedure
 *
 * Verifies that the client computed a valid proof-of-work.
 * Supports both pow5-64b and pow5-217a algorithms.
 *
 * This is a standalone verification endpoint for testing purposes.
 * For production use, the verification is integrated into registerVaultProcedure.
 */
export const verifyPowProofProcedure = base
  .input(VerifyPowProofRequestSchema)
  .output(VerifyPowProofResponseSchema)
  .handler(async ({ input }) => {
    const { challengeId, solvedHeader, hash } = input;
    return verifyPowProof(challengeId, solvedHeader, hash);
  });
