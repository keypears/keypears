import {
  GetPowChallengeRequestSchema,
  GetPowChallengeResponseSchema,
} from "../zod-schemas.js";
import { base } from "./base.js";
import { createChallenge } from "../db/models/pow-challenge.js";

// Default difficulty: 4,194,304 (2^22) = ~4 million hashes average
// Takes a few seconds with WGSL, much longer with WASM
const DEFAULT_DIFFICULTY = 4194304n;

/**
 * Get PoW Challenge procedure
 *
 * Randomly selects pow5-64b or pow5-217a algorithm (50/50).
 * Returns a fully random header of the appropriate size and target for mining.
 * The challenge is stored in the database and can only be used once.
 *
 * Note: This endpoint allows client-specified difficulty for testing purposes.
 * For registration, the server enforces a minimum difficulty during verification.
 *
 * Header sizes:
 * - pow5-64b: 64 bytes (nonce region: bytes 0-31)
 * - pow5-217a: 217 bytes (nonce region: bytes 117-148)
 *
 * Security:
 * - Challenge stored in database with unique ID
 * - Challenge expires after 5 minutes
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
