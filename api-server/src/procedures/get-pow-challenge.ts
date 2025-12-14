import { WebBuf } from "@webbuf/webbuf";
import { targetFromDifficulty } from "@keypears/pow5/dist/difficulty.js";
import {
  GetPowChallengeRequestSchema,
  GetPowChallengeResponseSchema,
  type PowAlgorithm,
} from "../zod-schemas.js";
import { base } from "./base.js";

// Hardcoded difficulty for testing: 256 = ~256 hashes average
// This should complete almost instantly for quick testing
const TEST_DIFFICULTY = 256n;

// Header sizes for each algorithm
const HEADER_SIZE_64B = 64;
const HEADER_SIZE_217A = 217;

/**
 * Get PoW Challenge procedure (FOR TESTING ONLY - NOT SECURE)
 *
 * Randomly selects pow5-64b or pow5-217a algorithm (50/50).
 * Returns a fully random header of the appropriate size and target for mining.
 *
 * Header sizes:
 * - pow5-64b: 64 bytes (nonce region: bytes 0-31)
 * - pow5-217a: 217 bytes (nonce region: bytes 117-148)
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
    // Randomly select algorithm: get 1 byte, mask to 1 bit for 50/50 selection
    const randomByte = crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
    const algorithm: PowAlgorithm =
      (randomByte & 1) === 0 ? "pow5-64b" : "pow5-217a";

    // Generate fully random header of appropriate size
    const headerSize =
      algorithm === "pow5-64b" ? HEADER_SIZE_64B : HEADER_SIZE_217A;
    const header = WebBuf.fromUint8Array(
      crypto.getRandomValues(new Uint8Array(headerSize)),
    );

    // Calculate target from difficulty
    const target = targetFromDifficulty(TEST_DIFFICULTY);

    return {
      header: header.toHex(),
      target: target.buf.toHex(),
      difficulty: TEST_DIFFICULTY.toString(),
      algorithm,
    };
  });
