import { FixedBuf } from "@keypears/lib";
import * as Pow5_64b_Wasm from "@keypears/pow5/dist/pow5-64b-wasm.js";
import * as Pow5_217a_Wasm from "@keypears/pow5/dist/pow5-217a-wasm.js";
import { hashMeetsTarget } from "@keypears/pow5/dist/difficulty.js";
import { createClient } from "../../src/client.js";

// Low difficulty for fast test execution: 256 (2^8) = ~256 hashes average
const TEST_DIFFICULTY = "256";

export interface PowProof {
  challengeId: string;
  solvedHeader: string;
  hash: string;
}

/**
 * Fetches a PoW challenge from the test server and solves it.
 * Uses low difficulty (256) for fast test execution.
 */
export async function solvePowChallenge(serverUrl: string): Promise<PowProof> {
  const client = createClient({ url: serverUrl });

  // Fetch challenge with low difficulty
  const challenge = await client.api.getPowChallenge({
    difficulty: TEST_DIFFICULTY,
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
