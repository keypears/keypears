import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "@webbuf/fixedbuf";
import { targetFromDifficulty } from "@keypears/pow5/dist/difficulty.js";
import {
  GetPowChallengeRequestSchema,
  GetPowChallengeResponseSchema,
} from "../zod-schemas.js";
import { base } from "./base.js";

// Hardcoded difficulty for testing: 256 = ~256 hashes average
// This should complete almost instantly for quick testing
const TEST_DIFFICULTY = 256n;

/**
 * Get PoW Challenge procedure (FOR TESTING ONLY - NOT SECURE)
 *
 * Returns a 64-byte header and target for proof-of-work mining.
 * The header is: [32 zero bytes] + [32 random bytes]
 *
 * This is NOT secure because:
 * - No challenge storage in database
 * - No expiration
 * - No rate limiting
 * - Client sends back the original header for verification
 */
export const getPowChallengeProcedure = base
  .input(GetPowChallengeRequestSchema)
  .output(GetPowChallengeResponseSchema)
  .handler(async () => {
    // Generate 32 random bytes for the challenge
    const challenge = WebBuf.fromUint8Array(crypto.getRandomValues(new Uint8Array(32)));

    // Create 64-byte header: [32 zero bytes (nonce)] + [32 random bytes (challenge)]
    const header = WebBuf.alloc(64);
    // First 32 bytes are zeros (nonce field, client will fill in)
    // Next 32 bytes are the random challenge
    header.set(challenge, 32);

    // Calculate target from difficulty
    const target = targetFromDifficulty(TEST_DIFFICULTY);

    return {
      header: header.toHex(),
      target: target.buf.toHex(),
      difficulty: TEST_DIFFICULTY.toString(),
    };
  });
