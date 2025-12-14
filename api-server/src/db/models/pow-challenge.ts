import { eq } from "drizzle-orm";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import * as Pow5_64b_Wasm from "@keypears/pow5/dist/pow5-64b-wasm.js";
import * as Pow5_217a_Wasm from "@keypears/pow5/dist/pow5-217a-wasm.js";
import {
  hashMeetsTarget,
  targetFromDifficulty,
} from "@keypears/pow5/dist/difficulty.js";
import { generateId } from "@keypears/lib";
import { db } from "../index.js";
import { TablePowChallenge } from "../schema.js";
import {
  CHALLENGE_EXPIRATION_MS,
  HEADER_SIZE_64B,
  HEADER_SIZE_217A,
  NONCE_START_64B,
  NONCE_END_64B,
  NONCE_START_217A,
  NONCE_END_217A,
} from "../../constants.js";

/**
 * PoW algorithm type
 */
export type PowAlgorithm = "pow5-64b" | "pow5-217a";

/**
 * PoW Challenge model interface
 */
export interface PowChallenge {
  id: string;
  algorithm: PowAlgorithm;
  header: string;
  target: string;
  difficulty: string;
  isUsed: boolean;
  solvedHeader: string | null;
  solvedHash: string | null;
  createdAt: Date;
  expiresAt: Date;
  verifiedAt: Date | null;
}

/**
 * Result of PoW verification
 */
export interface PowVerificationResult {
  valid: boolean;
  message: string;
}

/**
 * Options for creating a challenge
 */
export interface CreateChallengeOptions {
  difficulty: bigint;
  algorithm?: PowAlgorithm;
}

/**
 * Options for verifying and consuming a challenge
 */
export interface VerifyAndConsumeOptions {
  minDifficulty?: bigint;
}

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
 * Get a challenge by ID
 *
 * @param id - The challenge ID (ULID)
 * @returns The challenge if found, null otherwise
 */
export async function getChallenge(id: string): Promise<PowChallenge | null> {
  const result = await db
    .select()
    .from(TablePowChallenge)
    .where(eq(TablePowChallenge.id, id))
    .limit(1);

  const row = result[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    algorithm: row.algorithm as PowAlgorithm,
    header: row.header,
    target: row.target,
    difficulty: row.difficulty,
    isUsed: row.isUsed,
    solvedHeader: row.solvedHeader,
    solvedHash: row.solvedHash,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    verifiedAt: row.verifiedAt,
  };
}

/**
 * Create a new PoW challenge
 *
 * Generates a random header of the appropriate size for the algorithm,
 * calculates the target from the difficulty, and stores in the database.
 *
 * @param options - Challenge creation options
 * @returns The created challenge
 */
export async function createChallenge(
  options: CreateChallengeOptions,
): Promise<PowChallenge> {
  const { difficulty } = options;

  // Select algorithm: use provided or randomly select (50/50)
  let algorithm: PowAlgorithm;
  if (options.algorithm) {
    algorithm = options.algorithm;
  } else {
    const randomByte = FixedBuf.fromRandom(1).buf[0] ?? 0;
    algorithm = (randomByte & 1) === 0 ? "pow5-64b" : "pow5-217a";
  }

  // Generate fully random header of appropriate size
  const headerSize = algorithm === "pow5-64b" ? HEADER_SIZE_64B : HEADER_SIZE_217A;
  const header = FixedBuf.fromRandom(headerSize).buf;

  // Calculate target from difficulty
  const target = targetFromDifficulty(difficulty);

  // Generate challenge ID and expiration
  const id = generateId();
  const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRATION_MS);

  // Store challenge in database
  await db.insert(TablePowChallenge).values({
    id,
    algorithm,
    header: header.toHex(),
    target: target.buf.toHex(),
    difficulty: difficulty.toString(),
    expiresAt,
  });

  const challenge = await getChallenge(id);
  if (!challenge) {
    throw new Error("Failed to create challenge");
  }

  return challenge;
}

/**
 * Verify a PoW solution and mark the challenge as consumed
 *
 * This is the core verification method that:
 * 1. Looks up the challenge by ID
 * 2. Checks the challenge is not expired
 * 3. Checks the challenge has not already been used
 * 4. Checks the challenge difficulty meets the minimum (if provided)
 * 5. Validates the header length matches the algorithm
 * 6. Verifies non-nonce bytes match the original header
 * 7. Recomputes the hash and verifies it matches the provided hash
 * 8. Verifies the hash meets the difficulty target
 * 9. Updates the database: marks as used, stores solution, sets verifiedAt
 *
 * @param challengeId - The challenge ID to verify
 * @param solvedHeader - The solved header with the winning nonce (hex)
 * @param hash - The hash of the solved header (hex)
 * @param options - Optional verification options (minDifficulty)
 * @returns Verification result with valid flag and message
 */
export async function verifyAndConsume(
  challengeId: string,
  solvedHeader: string,
  hash: string,
  options?: VerifyAndConsumeOptions,
): Promise<PowVerificationResult> {
  try {
    // 1. Look up challenge from database
    const challenge = await getChallenge(challengeId);

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

    // 4. Check minimum difficulty requirement (if specified)
    if (options?.minDifficulty !== undefined) {
      const challengeDifficulty = BigInt(challenge.difficulty);
      if (challengeDifficulty < options.minDifficulty) {
        return {
          valid: false,
          message: `Challenge difficulty ${challenge.difficulty} is below minimum required ${options.minDifficulty}`,
        };
      }
    }

    // Get algorithm and original header from challenge
    const algorithm = challenge.algorithm;
    const originalHeader = challenge.header;

    // Determine expected header size and nonce region based on algorithm
    const expectedSize =
      algorithm === "pow5-64b" ? HEADER_SIZE_64B : HEADER_SIZE_217A;
    const nonceStart =
      algorithm === "pow5-64b" ? NONCE_START_64B : NONCE_START_217A;
    const nonceEnd = algorithm === "pow5-64b" ? NONCE_END_64B : NONCE_END_217A;

    // 5. Validate solved header length (hex string length = 2 * byte length)
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

    // 6. Zero out nonce regions and compare (non-nonce bytes must match)
    const originalZeroed = zeroNonceRegion(
      originalHeaderBuf,
      nonceStart,
      nonceEnd,
    );
    const solvedZeroed = zeroNonceRegion(solvedHeaderBuf, nonceStart, nonceEnd);

    if (!originalZeroed.equals(solvedZeroed)) {
      return {
        valid: false,
        message:
          "Non-nonce bytes do not match between original and solved headers",
      };
    }

    // 7. Recompute the hash and verify it matches
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

    // 8. Verify hash meets target
    if (!hashMeetsTarget(hashBuf, targetBuf)) {
      return {
        valid: false,
        message: "Hash does not meet difficulty target",
      };
    }

    // 9. Mark challenge as used and store solution
    await db
      .update(TablePowChallenge)
      .set({
        isUsed: true,
        solvedHeader,
        solvedHash: hash,
        verifiedAt: new Date(),
      })
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
}
