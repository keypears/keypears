/**
 * Security tests for DH-based messaging system
 *
 * Tests the three-layer verification system:
 * 1. PoW verification (DoS prevention)
 * 2. Signature verification (proves key ownership)
 * 3. Cross-domain identity verification (confirms pubkey belongs to address)
 *
 * Also tests channel binding, replay prevention, and idempotency.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { FixedBuf, generateId, publicKeyCreate, sign } from "@keypears/lib";
import { createClient } from "../src/client.js";
import { db } from "../src/db/index.js";
import {
  TableVault,
  TableDeviceSession,
  TablePowChallenge,
  TableEngagementKey,
  TableChannelView,
  TableInboxMessage,
} from "../src/db/schema.js";
import { solvePowChallenge, type PowProof } from "./helpers/solve-pow.js";
import {
  createTestVault,
  type TestVaultCredentials,
} from "./helpers/test-vault.js";
import {
  createSendEngagementKey,
  signPowHash,
  createInvalidSignature,
  signWithWrongKey,
  type TestEngagementKey,
} from "./helpers/engagement-key.js";

const TEST_SERVER_URL = "http://localhost:4273/api";
const client = createClient({ url: TEST_SERVER_URL });

describe("Secure Channel Establishment", () => {
  let alice: TestVaultCredentials;
  let bob: TestVaultCredentials;
  let aliceSendKey: TestEngagementKey;

  // Clean up all tables before each test
  beforeEach(async () => {
    await db.delete(TableInboxMessage);
    await db.delete(TableChannelView);
    await db.delete(TableEngagementKey);
    await db.delete(TablePowChallenge);
    await db.delete(TableDeviceSession);
    await db.delete(TableVault);

    // Create test vaults for Alice and Bob
    // Use keypears.localhost domain so cross-domain verification routes to test server
    alice = await createTestVault({
      name: "alice",
      domain: "keypears.localhost",
      seed: "alice-test-seed",
    });

    bob = await createTestVault({
      name: "bob",
      domain: "keypears.localhost",
      seed: "bob-test-seed",
    });

    // Create Alice's "send" engagement key for Bob
    aliceSendKey = await createSendEngagementKey(
      alice.vaultId,
      alice.vaultPrivKey,
      bob.address,
      alice.sessionToken,
    );
  });

  // ============================================================================
  // SIGNATURE VERIFICATION TESTS
  // ============================================================================

  describe("Signature verification", () => {
    it("should accept valid signature over solved PoW hash", async () => {
      // Solve PoW challenge with messaging difficulty
      const pow = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });

      // Sign the solved hash with Alice's engagement private key
      const signature = signPowHash(pow.hash, aliceSendKey.engagementPrivKey);

      // Request Bob's engagement key - should succeed
      const result = await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        senderPubKey: aliceSendKey.engagementPubKey,
        powChallengeId: pow.challengeId,
        solvedHeader: pow.solvedHeader,
        solvedHash: pow.hash,
        signature,
      });

      expect(result.engagementPubKey).toBeDefined();
      expect(result.engagementPubKey).toMatch(/^0[23][0-9a-f]{64}$/); // Compressed pubkey
    });

    it("should reject invalid signature (random bytes)", async () => {
      const pow = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const invalidSignature = createInvalidSignature();

      await expect(
        client.api.getCounterpartyEngagementKey({
          recipientAddress: bob.address,
          senderAddress: alice.address,
          senderPubKey: aliceSendKey.engagementPubKey,
          powChallengeId: pow.challengeId,
          solvedHeader: pow.solvedHeader,
          solvedHash: pow.hash,
          signature: invalidSignature,
        }),
      ).rejects.toThrow(/signature/i);
    });

    it("should reject signature from wrong key", async () => {
      const pow = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });

      // Sign with a different key than Alice's claimed pubkey
      const { signature } = signWithWrongKey(pow.hash);

      await expect(
        client.api.getCounterpartyEngagementKey({
          recipientAddress: bob.address,
          senderAddress: alice.address,
          senderPubKey: aliceSendKey.engagementPubKey, // Claims this pubkey
          powChallengeId: pow.challengeId,
          solvedHeader: pow.solvedHeader,
          solvedHash: pow.hash,
          signature, // But signed with different key
        }),
      ).rejects.toThrow(/signature/i);
    });

    it("should reject signature over wrong message (not solvedHash)", async () => {
      const pow = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });

      // Sign a different message than the solved hash
      const wrongMessage = FixedBuf.fromRandom(32);
      const nonce = FixedBuf.fromRandom(32);
      const wrongSignature = sign(wrongMessage, aliceSendKey.engagementPrivKey, nonce);

      await expect(
        client.api.getCounterpartyEngagementKey({
          recipientAddress: bob.address,
          senderAddress: alice.address,
          senderPubKey: aliceSendKey.engagementPubKey,
          powChallengeId: pow.challengeId,
          solvedHeader: pow.solvedHeader,
          solvedHash: pow.hash,
          signature: wrongSignature.buf.toHex(),
        }),
      ).rejects.toThrow(/signature/i);
    });
  });

  // ============================================================================
  // CROSS-DOMAIN VERIFICATION TESTS
  // ============================================================================

  describe("verifyEngagementKeyOwnership", () => {
    it("should return valid=true for existing send key", async () => {
      const result = await client.api.verifyEngagementKeyOwnership({
        address: alice.address,
        engagementPubKey: aliceSendKey.engagementPubKey,
      });

      expect(result.valid).toBe(true);
    });

    it("should return valid=false for unknown pubkey", async () => {
      // Generate a random pubkey that doesn't exist
      const randomPrivKey = FixedBuf.fromRandom(32);
      const randomPubKey = publicKeyCreate(randomPrivKey);

      const result = await client.api.verifyEngagementKeyOwnership({
        address: alice.address,
        engagementPubKey: randomPubKey.toHex(),
      });

      expect(result.valid).toBe(false);
    });

    it("should return valid=false for receive key (wrong purpose)", async () => {
      // First, complete the flow to create a "receive" key for Bob
      const pow = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature = signPowHash(pow.hash, aliceSendKey.engagementPrivKey);

      const bobReceiveResult = await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        senderPubKey: aliceSendKey.engagementPubKey,
        powChallengeId: pow.challengeId,
        solvedHeader: pow.solvedHeader,
        solvedHash: pow.hash,
        signature,
      });

      // Try to verify Bob's "receive" key - should return false
      // because verifyEngagementKeyOwnership only verifies "send" keys
      const result = await client.api.verifyEngagementKeyOwnership({
        address: bob.address,
        engagementPubKey: bobReceiveResult.engagementPubKey,
      });

      expect(result.valid).toBe(false);
    });

    it("should return valid=false for non-existent vault", async () => {
      const result = await client.api.verifyEngagementKeyOwnership({
        address: "nonexistent@keypears.com",
        engagementPubKey: aliceSendKey.engagementPubKey,
      });

      expect(result.valid).toBe(false);
    });

    it("should return valid=false for invalid address format", async () => {
      const result = await client.api.verifyEngagementKeyOwnership({
        address: "invalid-address-no-at-sign",
        engagementPubKey: aliceSendKey.engagementPubKey,
      });

      expect(result.valid).toBe(false);
    });
  });

  // ============================================================================
  // CHANNEL BINDING TESTS
  // ============================================================================

  describe("Channel binding", () => {
    let consumedPow: PowProof;
    let bobReceiveKeyPubKey: string;

    beforeEach(async () => {
      // Complete the full flow to consume a PoW
      consumedPow = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature = signPowHash(
        consumedPow.hash,
        aliceSendKey.engagementPrivKey,
      );

      const result = await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        senderPubKey: aliceSendKey.engagementPubKey,
        powChallengeId: consumedPow.challengeId,
        solvedHeader: consumedPow.solvedHeader,
        solvedHash: consumedPow.hash,
        signature,
      });

      bobReceiveKeyPubKey = result.engagementPubKey;
    });

    it("should reject PoW consumed for different sender address", async () => {
      // Try to send message claiming to be a different sender
      await expect(
        client.api.sendMessage({
          recipientAddress: bob.address,
          senderAddress: "mallory@keypears.com", // Different sender
          encryptedContent: "encrypted-content",
          senderEngagementPubKey: aliceSendKey.engagementPubKey,
          recipientEngagementPubKey: bobReceiveKeyPubKey,
          powChallengeId: consumedPow.challengeId,
        }),
      ).rejects.toThrow(/sender address does not match/i);
    });

    it("should reject PoW consumed for different recipient address", async () => {
      // Create another user (Carol)
      const carol = await createTestVault({
        name: "carol",
        domain: "keypears.localhost",
        seed: "carol-test-seed",
      });

      // Try to send message to different recipient
      await expect(
        client.api.sendMessage({
          recipientAddress: carol.address, // Different recipient
          senderAddress: alice.address,
          encryptedContent: "encrypted-content",
          senderEngagementPubKey: aliceSendKey.engagementPubKey,
          recipientEngagementPubKey: bobReceiveKeyPubKey,
          powChallengeId: consumedPow.challengeId,
        }),
      ).rejects.toThrow(/does not belong to recipient/i);
    });

    it("should reject PoW consumed for different sender pubkey", async () => {
      // Create a different engagement key for Alice
      const aliceSendKey2 = await createSendEngagementKey(
        alice.vaultId,
        alice.vaultPrivKey,
        bob.address,
        alice.sessionToken,
      );

      // Try to use the consumed PoW with a different pubkey
      await expect(
        client.api.sendMessage({
          recipientAddress: bob.address,
          senderAddress: alice.address,
          encryptedContent: "encrypted-content",
          senderEngagementPubKey: aliceSendKey2.engagementPubKey, // Different pubkey
          recipientEngagementPubKey: bobReceiveKeyPubKey,
          powChallengeId: consumedPow.challengeId,
        }),
      ).rejects.toThrow(/sender public key does not match/i);
    });

    it("should accept message with correct channel binding", async () => {
      const result = await client.api.sendMessage({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        encryptedContent: "encrypted-test-message",
        senderEngagementPubKey: aliceSendKey.engagementPubKey,
        recipientEngagementPubKey: bobReceiveKeyPubKey,
        powChallengeId: consumedPow.challengeId,
      });

      expect(result.messageId).toBeDefined();
      expect(result.orderInChannel).toBe(1);
    });
  });

  // ============================================================================
  // POW EXPIRATION & REPLAY TESTS
  // ============================================================================

  describe("PoW replay prevention", () => {
    it("should reject expired PoW challenge", async () => {
      // Create a PoW challenge
      const pow = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });

      // Manually expire it in the database
      await db
        .update(TablePowChallenge)
        .set({ expiresAt: new Date(Date.now() - 1000) }) // Expired 1 second ago
        .where(eq(TablePowChallenge.id, pow.challengeId));

      const signature = signPowHash(pow.hash, aliceSendKey.engagementPrivKey);

      await expect(
        client.api.getCounterpartyEngagementKey({
          recipientAddress: bob.address,
          senderAddress: alice.address,
          senderPubKey: aliceSendKey.engagementPubKey,
          powChallengeId: pow.challengeId,
          solvedHeader: pow.solvedHeader,
          solvedHash: pow.hash,
          signature,
        }),
      ).rejects.toThrow(/expired/i);
    });

    it("should reject already-used PoW challenge", async () => {
      // Complete the flow once to consume the PoW
      const pow = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature = signPowHash(pow.hash, aliceSendKey.engagementPrivKey);

      await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        senderPubKey: aliceSendKey.engagementPubKey,
        powChallengeId: pow.challengeId,
        solvedHeader: pow.solvedHeader,
        solvedHash: pow.hash,
        signature,
      });

      // Create a new engagement key for Alice (different pubkey)
      const aliceSendKey2 = await createSendEngagementKey(
        alice.vaultId,
        alice.vaultPrivKey,
        bob.address,
        alice.sessionToken,
      );
      const signature2 = signPowHash(pow.hash, aliceSendKey2.engagementPrivKey);

      // Try to reuse the same PoW
      await expect(
        client.api.getCounterpartyEngagementKey({
          recipientAddress: bob.address,
          senderAddress: alice.address,
          senderPubKey: aliceSendKey2.engagementPubKey,
          powChallengeId: pow.challengeId, // Same PoW!
          solvedHeader: pow.solvedHeader,
          solvedHash: pow.hash,
          signature: signature2,
        }),
      ).rejects.toThrow(/used|consumed/i);
    });

    it("should accept fresh unused PoW challenge", async () => {
      const pow = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature = signPowHash(pow.hash, aliceSendKey.engagementPrivKey);

      const result = await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        senderPubKey: aliceSendKey.engagementPubKey,
        powChallengeId: pow.challengeId,
        solvedHeader: pow.solvedHeader,
        solvedHash: pow.hash,
        signature,
      });

      expect(result.engagementPubKey).toBeDefined();
    });
  });

  // ============================================================================
  // IDEMPOTENT KEY CREATION TESTS
  // ============================================================================

  describe("Idempotent engagement keys", () => {
    it("should return same key for same sender+pubkey (no new PoW needed)", async () => {
      // First request - consumes PoW, creates key
      const pow1 = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature1 = signPowHash(pow1.hash, aliceSendKey.engagementPrivKey);

      const result1 = await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        senderPubKey: aliceSendKey.engagementPubKey,
        powChallengeId: pow1.challengeId,
        solvedHeader: pow1.solvedHeader,
        solvedHash: pow1.hash,
        signature: signature1,
      });

      // Second request with same sender+pubkey - should return same key without new PoW
      // Note: We're using a new PoW here, but the key should be the same
      const pow2 = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature2 = signPowHash(pow2.hash, aliceSendKey.engagementPrivKey);

      const result2 = await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        senderPubKey: aliceSendKey.engagementPubKey,
        powChallengeId: pow2.challengeId,
        solvedHeader: pow2.solvedHeader,
        solvedHash: pow2.hash,
        signature: signature2,
      });

      // Should get the same engagement key
      expect(result2.engagementPubKey).toBe(result1.engagementPubKey);
    });

    it("should create new key for same sender with different pubkey", async () => {
      // First key
      const pow1 = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature1 = signPowHash(pow1.hash, aliceSendKey.engagementPrivKey);

      const result1 = await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        senderPubKey: aliceSendKey.engagementPubKey,
        powChallengeId: pow1.challengeId,
        solvedHeader: pow1.solvedHeader,
        solvedHash: pow1.hash,
        signature: signature1,
      });

      // Create a different engagement key for Alice
      const aliceSendKey2 = await createSendEngagementKey(
        alice.vaultId,
        alice.vaultPrivKey,
        bob.address,
        alice.sessionToken,
      );

      // Second request with different pubkey
      const pow2 = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature2 = signPowHash(pow2.hash, aliceSendKey2.engagementPrivKey);

      const result2 = await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        senderPubKey: aliceSendKey2.engagementPubKey, // Different pubkey
        powChallengeId: pow2.challengeId,
        solvedHeader: pow2.solvedHeader,
        solvedHash: pow2.hash,
        signature: signature2,
      });

      // Should get a different engagement key
      expect(result2.engagementPubKey).not.toBe(result1.engagementPubKey);
    });

    it("should create new key for different sender with same address pattern", async () => {
      // Create a different vault for "alice2"
      const alice2 = await createTestVault({
        name: "alice2",
        domain: "keypears.localhost",
        seed: "alice2-test-seed",
      });

      const alice2SendKey = await createSendEngagementKey(
        alice2.vaultId,
        alice2.vaultPrivKey,
        bob.address,
        alice2.sessionToken,
      );

      // First request from alice
      const pow1 = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature1 = signPowHash(pow1.hash, aliceSendKey.engagementPrivKey);

      const result1 = await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        senderPubKey: aliceSendKey.engagementPubKey,
        powChallengeId: pow1.challengeId,
        solvedHeader: pow1.solvedHeader,
        solvedHash: pow1.hash,
        signature: signature1,
      });

      // Second request from alice2
      const pow2 = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature2 = signPowHash(pow2.hash, alice2SendKey.engagementPrivKey);

      const result2 = await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice2.address, // Different sender
        senderPubKey: alice2SendKey.engagementPubKey,
        powChallengeId: pow2.challengeId,
        solvedHeader: pow2.solvedHeader,
        solvedHash: pow2.hash,
        signature: signature2,
      });

      // Should get different engagement keys
      expect(result2.engagementPubKey).not.toBe(result1.engagementPubKey);
    });
  });

  // ============================================================================
  // FULL FLOW INTEGRATION TESTS
  // ============================================================================

  describe("Secure channel establishment flow", () => {
    it("should complete full Alice→Bob message flow successfully", async () => {
      // 1. Alice already has a "send" engagement key (created in beforeEach)

      // 2. Alice solves PoW and signs it
      const pow = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature = signPowHash(pow.hash, aliceSendKey.engagementPrivKey);

      // 3. Alice requests Bob's engagement key
      const bobKeyResult = await client.api.getCounterpartyEngagementKey({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        senderPubKey: aliceSendKey.engagementPubKey,
        powChallengeId: pow.challengeId,
        solvedHeader: pow.solvedHeader,
        solvedHash: pow.hash,
        signature,
      });

      expect(bobKeyResult.engagementPubKey).toBeDefined();

      // 4. Alice sends encrypted message
      const messageResult = await client.api.sendMessage({
        recipientAddress: bob.address,
        senderAddress: alice.address,
        encryptedContent: "test-encrypted-message-content",
        senderEngagementPubKey: aliceSendKey.engagementPubKey,
        recipientEngagementPubKey: bobKeyResult.engagementPubKey,
        powChallengeId: pow.challengeId,
      });

      expect(messageResult.messageId).toBeDefined();
      expect(messageResult.orderInChannel).toBe(1);
      expect(messageResult.createdAt).toBeDefined();

      // 5. Verify message is in Bob's inbox
      const messages = await db
        .select()
        .from(TableInboxMessage)
        .where(eq(TableInboxMessage.senderAddress, alice.address));

      expect(messages).toHaveLength(1);
      expect(messages[0]?.encryptedContent).toBe(
        "test-encrypted-message-content",
      );
    });

    it("should reject impersonation attempt (fake senderAddress)", async () => {
      // Alice tries to claim she's Bob when requesting Carol's key
      const carol = await createTestVault({
        name: "carol",
        domain: "keypears.localhost",
        seed: "carol-test-seed",
      });

      const pow = await solvePowChallenge(TEST_SERVER_URL, { forMessaging: true });
      const signature = signPowHash(pow.hash, aliceSendKey.engagementPrivKey);

      // Alice claims to be Bob, but signs with her own key
      // Cross-domain verification will fail because Bob's server
      // doesn't have an engagement key with Alice's pubkey
      await expect(
        client.api.getCounterpartyEngagementKey({
          recipientAddress: carol.address,
          senderAddress: bob.address, // Alice claims to be Bob
          senderPubKey: aliceSendKey.engagementPubKey, // But uses her own key
          powChallengeId: pow.challengeId,
          solvedHeader: pow.solvedHeader,
          solvedHash: pow.hash,
          signature,
        }),
      ).rejects.toThrow(/verification failed|does not belong/i);
    });
  });
});
