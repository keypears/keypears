import {
  VerifyPowProofRequestSchema,
  VerifyPowProofResponseSchema,
} from "@keypears/api-client";
import { base } from "./base.js";
import { verifyAndConsume } from "../db/models/pow-challenge.js";

/**
 * Verify PoW Proof procedure
 *
 * Verifies that the client computed a valid proof-of-work.
 * Currently supports pow5-64b algorithm.
 *
 * This is a standalone verification endpoint for testing purposes.
 * It does NOT enforce minimum difficulty - use registerVault for that.
 * The challenge is consumed (marked as used) upon successful verification.
 */
export const verifyPowProofProcedure = base
  .input(VerifyPowProofRequestSchema)
  .output(VerifyPowProofResponseSchema)
  .handler(async ({ input }) => {
    const { challengeId, solvedHeader, hash } = input;
    return verifyAndConsume(challengeId, solvedHeader, hash);
  });
