import { FixedBuf, difficultyForName } from "@keypears/lib";
import * as Pow5_64b_Wasm from "@keypears/pow5/dist/pow5-64b-wasm.js";
import { hashMeetsTarget } from "@keypears/pow5/dist/difficulty.js";
import { createClient } from "../../src/client.js";

export interface PowProof {
  challengeId: string;
  solvedHeader: string;
  hash: string;
}

export interface SolvePowOptions {
  /** Difficulty to request. If not specified, uses difficultyForName(name) */
  difficulty?: number;
  /** Vault name being registered - used to calculate difficulty if not specified */
  name?: string;
}

/**
 * Fetches a PoW challenge from the test server and solves it.
 *
 * In test environment (NODE_ENV=test), difficultyForName returns trivial values
 * (base 1 with 2x scaling), so tests complete instantly.
 *
 * @param serverUrl - The test server URL
 * @param options - Optional settings
 * @param options.difficulty - Explicit difficulty to request
 * @param options.name - Vault name (used to calculate difficulty via difficultyForName)
 */
export async function solvePowChallenge(
  serverUrl: string,
  options?: SolvePowOptions,
): Promise<PowProof> {
  // Use explicit difficulty, or calculate from name, or use a safe default
  const difficulty =
    options?.difficulty ??
    (options?.name ? Number(difficultyForName(options.name)) : 128);
  const client = createClient({ url: serverUrl });

  // Fetch challenge with specified difficulty
  const challenge = await client.api.getPowChallenge({
    difficulty,
  });

  const targetBuf = FixedBuf.fromHex(32, challenge.target);
  const headerBuf = FixedBuf.fromHex(64, challenge.header);

  let solvedHeaderHex: string = "";
  let hashHex: string = "";
  let nonce = 0;
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

  return {
    challengeId: challenge.id,
    solvedHeader: solvedHeaderHex,
    hash: hashHex,
  };
}
