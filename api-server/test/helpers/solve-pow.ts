import { FixedBuf } from "@keypears/lib";
import * as Pow5_64b_Wasm from "@keypears/pow5/dist/pow5-64b-wasm.js";
import * as Pow5_217a_Wasm from "@keypears/pow5/dist/pow5-217a-wasm.js";
import { hashMeetsTarget } from "@keypears/pow5/dist/difficulty.js";
import { createClient } from "../../src/client.js";

// Low difficulty for fast test execution: 256 (2^8) = ~256 hashes average
export const TEST_DIFFICULTY_LOW = "256";

// Medium difficulty for faster registration tests: 1024 (2^10)
// Still below REGISTRATION_DIFFICULTY but faster than full difficulty
export const TEST_DIFFICULTY_MEDIUM = "1024";

export interface PowProof {
  challengeId: string;
  solvedHeader: string;
  hash: string;
}

export interface SolvePowOptions {
  difficulty?: string;
}

/**
 * Fetches a PoW challenge from the test server and solves it.
 *
 * @param serverUrl - The test server URL
 * @param options - Optional settings
 * @param options.difficulty - Difficulty to request (default: TEST_DIFFICULTY_LOW for speed)
 *
 * Note: For registration tests, difficulty doesn't matter at the API level
 * since we use a test-specific low REGISTRATION_DIFFICULTY via test setup.
 */
export async function solvePowChallenge(
  serverUrl: string,
  options?: SolvePowOptions,
): Promise<PowProof> {
  const difficulty = options?.difficulty ?? TEST_DIFFICULTY_LOW;
  const client = createClient({ url: serverUrl });

  // Fetch challenge with specified difficulty
  const challenge = await client.api.getPowChallenge({
    difficulty,
  });

  const targetBuf = FixedBuf.fromHex(32, challenge.target);

  let solvedHeaderHex: string;
  let hashHex: string;
  let nonce = 0;

  if (challenge.algorithm === "pow5-64b") {
    const headerBuf = FixedBuf.fromHex(64, challenge.header);

    let found = false;
    while (!found) {
      const testHeader = Pow5_64b_Wasm.insertNonce(headerBuf, nonce);
      const testHash = Pow5_64b_Wasm.elementaryIteration(testHeader);

      if (hashMeetsTarget(testHash, targetBuf)) {
        solvedHeaderHex = testHeader.buf.toHex();
        hashHex = testHash.buf.toHex();
        found = true;
      } else {
        nonce++;
        if (nonce > 100_000) {
          throw new Error("Test PoW took too long (>100k iterations)");
        }
      }
    }
  } else {
    // pow5-217a
    const headerBuf = FixedBuf.fromHex(217, challenge.header);

    let found = false;
    while (!found) {
      const testHeader = Pow5_217a_Wasm.insertNonce(headerBuf, nonce);
      const testHash = Pow5_217a_Wasm.elementaryIteration(testHeader);

      if (hashMeetsTarget(testHash, targetBuf)) {
        solvedHeaderHex = testHeader.buf.toHex();
        hashHex = testHash.buf.toHex();
        found = true;
      } else {
        nonce++;
        if (nonce > 100_000) {
          throw new Error("Test PoW took too long (>100k iterations)");
        }
      }
    }
  }

  return {
    challengeId: challenge.id,
    solvedHeader: solvedHeaderHex!,
    hash: hashHex!,
  };
}
