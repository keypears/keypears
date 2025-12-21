import { describe, it, expect, beforeEach } from "vitest";
import { FixedBuf } from "@webbuf/fixedbuf";
import * as Pow5_64b_Wasm from "@keypears/pow5/dist/pow5-64b-wasm.js";
import { hashMeetsTarget } from "@keypears/pow5/dist/difficulty.js";
import {
  createChallenge,
  getChallenge,
  verifyAndConsume,
  setChannelBinding,
} from "../src/db/models/pow-challenge.js";
import { db } from "../src/db/index.js";
import { TablePowChallenge } from "../src/db/schema.js";
import { CHALLENGE_EXPIRATION_MS } from "../src/constants.js";

describe("PowChallenge Model", () => {
  beforeEach(async () => {
    await db.delete(TablePowChallenge);
  });

  describe("createChallenge", () => {
    it("should create a challenge with correct difficulty", async () => {
      const challenge = await createChallenge({ difficulty: 128n });

      expect(challenge.id).toHaveLength(26);
      expect(challenge.algorithm).toBe("pow5-64b");
      expect(challenge.difficulty).toBe(128);
      expect(challenge.header).toHaveLength(128); // 64 bytes hex
      expect(challenge.target).toHaveLength(64); // 32 bytes hex
      expect(challenge.isUsed).toBe(false);
      expect(challenge.solvedHeader).toBeNull();
      expect(challenge.solvedHash).toBeNull();
      expect(challenge.verifiedAt).toBeNull();
    });

    it("should set correct expiration time", async () => {
      const beforeCreate = Date.now();
      const challenge = await createChallenge({ difficulty: 256n });
      const afterCreate = Date.now();

      // expiresAt should be ~CHALLENGE_EXPIRATION_MS from now
      const expectedExpiry = beforeCreate + CHALLENGE_EXPIRATION_MS;
      const actualExpiry = challenge.expiresAt.getTime();

      // Allow 1 second tolerance for timing
      expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(actualExpiry).toBeLessThanOrEqual(afterCreate + CHALLENGE_EXPIRATION_MS + 1000);
    });
  });

  describe("getChallenge", () => {
    it("should return challenge by ID", async () => {
      const created = await createChallenge({ difficulty: 512n });
      const found = await getChallenge(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.difficulty).toBe(512);
      expect(found?.algorithm).toBe("pow5-64b");
    });

    it("should return null for non-existent ID", async () => {
      const found = await getChallenge("00000000000000000000000000");

      expect(found).toBeNull();
    });
  });

  describe("verifyAndConsume", () => {
    it("should accept valid PoW solution", async () => {
      // Create challenge with trivial difficulty
      const challenge = await createChallenge({ difficulty: 1n });

      // Solve the challenge
      const targetBuf = FixedBuf.fromHex(32, challenge.target);
      const headerBuf = FixedBuf.fromHex(64, challenge.header);

      let solvedHeader: FixedBuf<64> | null = null;
      let hash: FixedBuf<32> | null = null;

      for (let nonce = 0; nonce < 10000; nonce++) {
        const testHeader = Pow5_64b_Wasm.insertNonce(headerBuf, nonce);
        const testHash = Pow5_64b_Wasm.elementaryIteration(testHeader);

        if (hashMeetsTarget(testHash, targetBuf)) {
          solvedHeader = testHeader;
          hash = testHash;
          break;
        }
      }

      expect(solvedHeader).not.toBeNull();
      expect(hash).not.toBeNull();

      // Verify and consume
      const result = await verifyAndConsume(
        challenge.id,
        solvedHeader!.buf.toHex(),
        hash!.buf.toHex(),
      );

      expect(result.valid).toBe(true);
      expect(result.message).toContain("verified successfully");

      // Verify challenge is now marked as used
      const updated = await getChallenge(challenge.id);
      expect(updated?.isUsed).toBe(true);
      expect(updated?.verifiedAt).not.toBeNull();
    });

    it("should reject non-existent challenge", async () => {
      const result = await verifyAndConsume(
        "00000000000000000000000000",
        "0".repeat(128),
        "0".repeat(64),
      );

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Challenge not found");
    });

    it("should reject already-used challenge", async () => {
      // Create and solve challenge
      const challenge = await createChallenge({ difficulty: 1n });
      const targetBuf = FixedBuf.fromHex(32, challenge.target);
      const headerBuf = FixedBuf.fromHex(64, challenge.header);

      let solvedHeader: FixedBuf<64> | null = null;
      let hash: FixedBuf<32> | null = null;

      for (let nonce = 0; nonce < 10000; nonce++) {
        const testHeader = Pow5_64b_Wasm.insertNonce(headerBuf, nonce);
        const testHash = Pow5_64b_Wasm.elementaryIteration(testHeader);

        if (hashMeetsTarget(testHash, targetBuf)) {
          solvedHeader = testHeader;
          hash = testHash;
          break;
        }
      }

      // First use should succeed
      const result1 = await verifyAndConsume(
        challenge.id,
        solvedHeader!.buf.toHex(),
        hash!.buf.toHex(),
      );
      expect(result1.valid).toBe(true);

      // Second use should fail
      const result2 = await verifyAndConsume(
        challenge.id,
        solvedHeader!.buf.toHex(),
        hash!.buf.toHex(),
      );
      expect(result2.valid).toBe(false);
      expect(result2.message).toBe("Challenge has already been used");
    });

    it("should reject wrong header length", async () => {
      const challenge = await createChallenge({ difficulty: 1n });

      const result = await verifyAndConsume(
        challenge.id,
        "deadbeef", // Too short
        "0".repeat(64),
      );

      expect(result.valid).toBe(false);
      expect(result.message).toContain("Solved header length invalid");
    });

    it("should reject hash mismatch", async () => {
      const challenge = await createChallenge({ difficulty: 1n });

      const result = await verifyAndConsume(
        challenge.id,
        challenge.header, // Use original header (with zeros in nonce area)
        "0".repeat(64), // Fake hash
      );

      expect(result.valid).toBe(false);
      expect(result.message).toBe("Hash does not match computed value");
    });

    it("should enforce minDifficulty option", async () => {
      // Create challenge with low difficulty
      const challenge = await createChallenge({ difficulty: 64n });

      const result = await verifyAndConsume(
        challenge.id,
        challenge.header,
        "0".repeat(64),
        { minDifficulty: 256n },
      );

      expect(result.valid).toBe(false);
      expect(result.message).toContain("difficulty 64 is below minimum required 256");
    });
  });

  describe("setChannelBinding", () => {
    it("should store channel binding info on challenge", async () => {
      const challenge = await createChallenge({ difficulty: 256n });

      await setChannelBinding(
        challenge.id,
        "alice@example.com",
        "bob@example2.com",
        `02${  "a".repeat(64)}`, // 66 char pubkey
      );

      const updated = await getChallenge(challenge.id);

      expect(updated?.senderAddress).toBe("alice@example.com");
      expect(updated?.recipientAddress).toBe("bob@example2.com");
      expect(updated?.senderPubKey).toBe(`02${  "a".repeat(64)}`);
    });

    it("should be able to update channel binding multiple times", async () => {
      const challenge = await createChallenge({ difficulty: 256n });

      // First binding
      await setChannelBinding(
        challenge.id,
        "alice@example.com",
        "bob@example2.com",
        `02${  "a".repeat(64)}`,
      );

      // Second binding (overwrite)
      await setChannelBinding(
        challenge.id,
        "charlie@example.com",
        "dave@example2.com",
        `03${  "b".repeat(64)}`,
      );

      const updated = await getChallenge(challenge.id);

      expect(updated?.senderAddress).toBe("charlie@example.com");
      expect(updated?.recipientAddress).toBe("dave@example2.com");
      expect(updated?.senderPubKey).toBe(`03${  "b".repeat(64)}`);
    });
  });
});
