import { describe, it, expect, beforeEach } from "vitest";
import { generateId } from "@keypears/lib";
import {
  createEngagementKey,
  getEngagementKeyById,
  getEngagementKeyByPubKey,
  getEngagementKeyForReceiving,
  type CreateEngagementKeyParams,
} from "../src/db/models/engagement-key.js";
import { db } from "../src/db/index.js";
import { TableEngagementKey, TableVault } from "../src/db/schema.js";

// Test fixture data
const createTestKeyParams = (
  overrides: Partial<CreateEngagementKeyParams> = {},
): CreateEngagementKeyParams => ({
  id: generateId(),
  vaultId: "01HTEST000000000000000001",
  dbEntropy: "a".repeat(64),
  dbEntropyHash: "b".repeat(64),
  serverEntropyIndex: 1,
  derivationPubKey: `02${"c".repeat(64)}`,
  engagementPubKey: `02${"d".repeat(64)}`,
  engagementPubKeyHash: "e".repeat(64),
  purpose: "send" as const,
  counterpartyAddress: "bob@example.com",
  counterpartyPubKey: `02${"f".repeat(64)}`,
  ...overrides,
});

describe("EngagementKey Model", () => {
  beforeEach(async () => {
    // Clean up tables before each test
    await db.delete(TableEngagementKey);
    await db.delete(TableVault);

    // Create a test vault for foreign key constraint
    await db.insert(TableVault).values({
      id: "01HTEST000000000000000001",
      name: "alice",
      domain: "example.com",
      vaultPubKeyHash: "test-pubkey-hash",
      vaultPubKey: `02${"0".repeat(64)}`,
      hashedLoginKey: "test-hashed-login-key",
      encryptedVaultKey: "test-encrypted-vault-key",
    });
  });

  describe("createEngagementKey", () => {
    it("should create an engagement key with all fields", async () => {
      const params = createTestKeyParams();
      const key = await createEngagementKey(params);

      expect(key.id).toBe(params.id);
      expect(key.vaultId).toBe(params.vaultId);
      expect(key.dbEntropy).toBe(params.dbEntropy);
      expect(key.dbEntropyHash).toBe(params.dbEntropyHash);
      expect(key.serverEntropyIndex).toBe(params.serverEntropyIndex);
      expect(key.derivationPubKey).toBe(params.derivationPubKey);
      expect(key.engagementPubKey).toBe(params.engagementPubKey);
      expect(key.engagementPubKeyHash).toBe(params.engagementPubKeyHash);
      expect(key.purpose).toBe("send");
      expect(key.counterpartyAddress).toBe("bob@example.com");
      expect(key.counterpartyPubKey).toBe(params.counterpartyPubKey);
      expect(key.createdAt).toBeInstanceOf(Date);
    });

    it("should create key with null counterparty fields", async () => {
      const params = createTestKeyParams({
        counterpartyAddress: null,
        counterpartyPubKey: null,
      });
      const key = await createEngagementKey(params);

      expect(key.counterpartyAddress).toBeNull();
      expect(key.counterpartyPubKey).toBeNull();
    });

    it("should use default vaultGeneration (1) when not provided", async () => {
      const params = createTestKeyParams();
      const key = await createEngagementKey(params);

      expect(key.vaultGeneration).toBe(1);
    });

    it("should accept custom vaultGeneration", async () => {
      const params = createTestKeyParams();
      const key = await createEngagementKey({ ...params, vaultGeneration: 5 });

      expect(key.vaultGeneration).toBe(5);
    });

    it("should create keys with different purposes", async () => {
      const sendKey = await createEngagementKey(
        createTestKeyParams({ purpose: "send" }),
      );
      const receiveKey = await createEngagementKey(
        createTestKeyParams({
          id: generateId(),
          purpose: "receive",
          engagementPubKey: `02${"1".repeat(64)}`,
          engagementPubKeyHash: "1".repeat(64),
        }),
      );
      const manualKey = await createEngagementKey(
        createTestKeyParams({
          id: generateId(),
          purpose: "manual",
          engagementPubKey: `02${"2".repeat(64)}`,
          engagementPubKeyHash: "2".repeat(64),
        }),
      );

      expect(sendKey.purpose).toBe("send");
      expect(receiveKey.purpose).toBe("receive");
      expect(manualKey.purpose).toBe("manual");
    });
  });

  describe("getEngagementKeyById", () => {
    it("should return key by ID", async () => {
      const params = createTestKeyParams();
      await createEngagementKey(params);

      const found = await getEngagementKeyById(params.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(params.id);
      expect(found?.engagementPubKey).toBe(params.engagementPubKey);
    });

    it("should return null for non-existent ID", async () => {
      const found = await getEngagementKeyById("00000000000000000000000000");

      expect(found).toBeNull();
    });
  });

  describe("getEngagementKeyByPubKey", () => {
    it("should return key by public key", async () => {
      const params = createTestKeyParams();
      await createEngagementKey(params);

      const found = await getEngagementKeyByPubKey(params.engagementPubKey);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(params.id);
      expect(found?.engagementPubKey).toBe(params.engagementPubKey);
    });

    it("should return null for non-existent pubkey", async () => {
      const found = await getEngagementKeyByPubKey(`02${"9".repeat(64)}`);

      expect(found).toBeNull();
    });
  });

  describe("getEngagementKeyForReceiving", () => {
    it("should find receive key by vault, counterparty, and pubkey", async () => {
      const params = createTestKeyParams({
        purpose: "receive",
        counterpartyAddress: "sender@other.com",
        counterpartyPubKey: `03${"1".repeat(64)}`,
      });
      await createEngagementKey(params);

      const found = await getEngagementKeyForReceiving(
        params.vaultId,
        "sender@other.com",
        `03${"1".repeat(64)}`,
      );

      expect(found).not.toBeNull();
      expect(found?.id).toBe(params.id);
      expect(found?.purpose).toBe("receive");
    });

    it("should not find send key (wrong purpose)", async () => {
      const params = createTestKeyParams({
        purpose: "send",
        counterpartyAddress: "sender@other.com",
        counterpartyPubKey: `03${"1".repeat(64)}`,
      });
      await createEngagementKey(params);

      const found = await getEngagementKeyForReceiving(
        params.vaultId,
        "sender@other.com",
        `03${"1".repeat(64)}`,
      );

      expect(found).toBeNull();
    });

    it("should return null when counterparty address doesn't match", async () => {
      const params = createTestKeyParams({
        purpose: "receive",
        counterpartyAddress: "sender@other.com",
        counterpartyPubKey: `03${"1".repeat(64)}`,
      });
      await createEngagementKey(params);

      const found = await getEngagementKeyForReceiving(
        params.vaultId,
        "different@other.com", // Different address
        `03${"1".repeat(64)}`,
      );

      expect(found).toBeNull();
    });

    it("should return null when counterparty pubkey doesn't match", async () => {
      const params = createTestKeyParams({
        purpose: "receive",
        counterpartyAddress: "sender@other.com",
        counterpartyPubKey: `03${"1".repeat(64)}`,
      });
      await createEngagementKey(params);

      const found = await getEngagementKeyForReceiving(
        params.vaultId,
        "sender@other.com",
        `03${"2".repeat(64)}`, // Different pubkey
      );

      expect(found).toBeNull();
    });

    it("should return null when vault doesn't match", async () => {
      const params = createTestKeyParams({
        purpose: "receive",
        counterpartyAddress: "sender@other.com",
        counterpartyPubKey: `03${"1".repeat(64)}`,
      });
      await createEngagementKey(params);

      const found = await getEngagementKeyForReceiving(
        "01HDIFFERENT0000000000000", // Different vault
        "sender@other.com",
        `03${"1".repeat(64)}`,
      );

      expect(found).toBeNull();
    });
  });
});
