import { describe, it, expect, beforeAll } from "vitest";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { Pow5_64b_Wasm, hashMeetsTarget } from "@keypears/pow5";
import { createPowChallenge, verifyPowSolution } from "./pow.server";

beforeAll(() => {
  process.env.POW_SECRET = FixedBuf.fromRandom(32).buf.toHex();
});

function solveChallenge(headerHex: string, targetHex: string): string {
  const headerBuf = WebBuf.fromHex(headerHex);
  const targetBuf = FixedBuf.fromHex(32, targetHex);

  let nonce = 0;
  while (true) {
    const nonceBuf = WebBuf.alloc(32);
    let remaining = BigInt(nonce);
    for (let i = 31; i >= 0; i--) {
      nonceBuf[i] = Number(remaining & 0xffn);
      remaining = remaining >> 8n;
    }
    const testHeader = FixedBuf.fromBuf(
      64,
      WebBuf.from([...nonceBuf, ...headerBuf.slice(32)]),
    );
    const hash = Pow5_64b_Wasm.elementaryIteration(testHeader);
    if (hashMeetsTarget(hash, targetBuf)) {
      return testHeader.buf.toHex();
    }
    nonce++;
    if (nonce > 1_000_000) throw new Error("Could not solve in 1M iterations");
  }
}

describe("PoW verification", () => {
  it("accepts a valid solved challenge", () => {
    const challenge = createPowChallenge(1n);
    const solvedHeader = solveChallenge(challenge.header, challenge.target);
    const result = verifyPowSolution(
      solvedHeader,
      challenge.target,
      challenge.expiresAt,
      challenge.signature,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects an expired challenge", () => {
    const challenge = createPowChallenge(1n);
    const solvedHeader = solveChallenge(challenge.header, challenge.target);
    const result = verifyPowSolution(
      solvedHeader,
      challenge.target,
      Date.now() - 1000, // expired 1 second ago
      challenge.signature,
    );
    expect(result.valid).toBe(false);
    expect(result.message).toBe("Challenge expired");
  });

  it("rejects a tampered signature", () => {
    const challenge = createPowChallenge(1n);
    const solvedHeader = solveChallenge(challenge.header, challenge.target);
    const fakeSig = FixedBuf.fromRandom(32).buf.toHex();
    const result = verifyPowSolution(
      solvedHeader,
      challenge.target,
      challenge.expiresAt,
      fakeSig,
    );
    expect(result.valid).toBe(false);
    expect(result.message).toBe("Invalid signature");
  });

  it("rejects a tampered target (lowered difficulty)", () => {
    const challenge = createPowChallenge(100n);
    const solvedHeader = solveChallenge(challenge.header, challenge.target);
    // Use a different (easier) target — signature won't match
    const easyTarget = "ff".repeat(32);
    const result = verifyPowSolution(
      solvedHeader,
      easyTarget,
      challenge.expiresAt,
      challenge.signature,
    );
    expect(result.valid).toBe(false);
    expect(result.message).toBe("Invalid signature");
  });

  it("rejects a tampered expiresAt (extended expiry)", () => {
    const challenge = createPowChallenge(1n);
    const solvedHeader = solveChallenge(challenge.header, challenge.target);
    const result = verifyPowSolution(
      solvedHeader,
      challenge.target,
      challenge.expiresAt + 999999999, // extended
      challenge.signature,
    );
    expect(result.valid).toBe(false);
    expect(result.message).toBe("Invalid signature");
  });

  it("rejects a hash that does not meet target", () => {
    // Create a challenge with very high difficulty
    const challenge = createPowChallenge(1n);
    // Submit the unsolved header (random nonce, unlikely to meet any target)
    const result = verifyPowSolution(
      challenge.header, // unsolved — original random header
      challenge.target,
      challenge.expiresAt,
      challenge.signature,
    );
    // This could theoretically pass if the random header happens to solve it,
    // but with difficulty 1 the original header likely passes too.
    // Instead, use high difficulty to guarantee failure.
    const hardChallenge = createPowChallenge(
      1_000_000_000_000_000_000_000_000n,
    );
    const hardResult = verifyPowSolution(
      hardChallenge.header,
      hardChallenge.target,
      hardChallenge.expiresAt,
      hardChallenge.signature,
    );
    expect(hardResult.valid).toBe(false);
    expect(hardResult.message).toBe("Hash does not meet target");
  });

  it("rejects wrong header size", () => {
    const challenge = createPowChallenge(1n);
    const shortHeader = "aa".repeat(32); // 32 bytes, not 64
    const result = verifyPowSolution(
      shortHeader,
      challenge.target,
      challenge.expiresAt,
      challenge.signature,
    );
    expect(result.valid).toBe(false);
    // Will fail on signature since header is wrong size
    expect(result.message).toBe("Invalid signature");
  });
});
