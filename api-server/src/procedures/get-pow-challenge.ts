import { WebBuf } from "@webbuf/webbuf";
import { targetFromDifficulty } from "@keypears/pow5/dist/difficulty.js";
import { generateId } from "@keypears/lib";
import {
  GetPowChallengeRequestSchema,
  GetPowChallengeResponseSchema,
  type PowAlgorithm,
} from "../zod-schemas.js";
import { base } from "./base.js";
import { db } from "../db/index.js";
import { TablePowChallenge } from "../db/schema.js";

// Hardcoded difficulty for testing: 4,194,304 (2^22) = ~4 million hashes average
// Takes a few seconds with WGSL, much longer with WASM
const TEST_DIFFICULTY = 4194304n;

// Header sizes for each algorithm
const HEADER_SIZE_64B = 64;
const HEADER_SIZE_217A = 217;

// Challenge expiration time in milliseconds (5 minutes)
const CHALLENGE_EXPIRATION_MS = 5 * 60 * 1000;

/**
 * Get PoW Challenge procedure
 *
 * Randomly selects pow5-64b or pow5-217a algorithm (50/50).
 * Returns a fully random header of the appropriate size and target for mining.
 * The challenge is stored in the database and can only be used once.
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

    // Generate challenge ID and expiration
    const id = generateId();
    const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRATION_MS);

    // Store challenge in database
    await db.insert(TablePowChallenge).values({
      id,
      algorithm,
      header: header.toHex(),
      target: target.buf.toHex(),
      difficulty: TEST_DIFFICULTY.toString(),
      expiresAt,
    });

    return {
      id,
      header: header.toHex(),
      target: target.buf.toHex(),
      difficulty: TEST_DIFFICULTY.toString(),
      algorithm,
    };
  });
