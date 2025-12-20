import {
  GetPowChallengeRequestSchema,
  GetPowChallengeResponseSchema,
} from "../zod-schemas.js";
import { base } from "./base.js";
import { createChallenge } from "../db/models/pow-challenge.js";

// Default difficulty: 4,000,000 = ~4 million hashes average
// Takes a few seconds with WGSL, much longer with WASM
const DEFAULT_DIFFICULTY = 4_000_000n;

/**
 * Get PoW Challenge procedure
 *
 * Currently uses pow5-64b algorithm (more algorithms may be added in the future).
 * Returns a fully random 64-byte header and target for mining.
 * The challenge is stored in the database and can only be used once.
 *
 * Note: This endpoint allows client-specified difficulty for testing purposes.
 * For registration, the server enforces a minimum difficulty during verification.
 *
 * pow5-64b: 64 bytes header, nonce region: bytes 0-31
 *
 * Security:
 * - Challenge stored in database with unique ID
 * - Challenge expires after 15 minutes
 * - Each challenge can only be verified once (marked as used)
 */
export const getPowChallengeProcedure = base
  .input(GetPowChallengeRequestSchema)
  .output(GetPowChallengeResponseSchema)
  .handler(async ({ input }) => {
    // Use client-provided difficulty or default
    const difficulty = input.difficulty
      ? BigInt(input.difficulty)
      : DEFAULT_DIFFICULTY;

    // Create challenge using model
    const challenge = await createChallenge({ difficulty });

    return {
      id: challenge.id,
      header: challenge.header,
      target: challenge.target,
      difficulty: challenge.difficulty,
      algorithm: challenge.algorithm,
    };
  });
