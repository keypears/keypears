import { describe, it, expect, beforeEach } from "vitest";
import {
  createSecretUpdate,
  getMaxGlobalOrder,
  getMaxLocalOrder,
  getSecretUpdatesSince,
} from "../src/db/models/secret-update.js";
import { db } from "../src/db/index.js";
import { TableSecretUpdate, TableVault } from "../src/db/schema.js";

const TEST_VAULT_ID = "01HTEST000000000000000001";
const TEST_SECRET_ID_1 = "01HSECRET00000000000001";
const TEST_SECRET_ID_2 = "01HSECRET00000000000002";

describe("SecretUpdate Model", () => {
  beforeEach(async () => {
    // Clean up tables before each test
    await db.delete(TableSecretUpdate);
    await db.delete(TableVault);

    // Create a test vault for foreign key constraint
    await db.insert(TableVault).values({
      id: TEST_VAULT_ID,
      name: "alice",
      domain: "example.com",
      vaultPubKeyHash: "test-pubkey-hash",
      vaultPubKey: `02${"0".repeat(64)}`,
      hashedLoginKey: "test-hashed-login-key",
      encryptedVaultKey: "test-encrypted-vault-key",
    });
  });

  describe("getMaxGlobalOrder", () => {
    it("should return 0 for vault with no updates", async () => {
      const maxOrder = await getMaxGlobalOrder(TEST_VAULT_ID);

      expect(maxOrder).toBe(0);
    });

    it("should return correct max after updates", async () => {
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "encrypted1");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "encrypted2");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "encrypted3");

      const maxOrder = await getMaxGlobalOrder(TEST_VAULT_ID);

      expect(maxOrder).toBe(3);
    });

    it("should return 0 for non-existent vault", async () => {
      const maxOrder = await getMaxGlobalOrder("00000000000000000000000000");

      expect(maxOrder).toBe(0);
    });
  });

  describe("getMaxLocalOrder", () => {
    it("should return 0 for secret with no updates", async () => {
      const maxOrder = await getMaxLocalOrder(TEST_SECRET_ID_1);

      expect(maxOrder).toBe(0);
    });

    it("should return correct max after updates", async () => {
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "encrypted1");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "encrypted2");

      const maxOrder = await getMaxLocalOrder(TEST_SECRET_ID_1);

      expect(maxOrder).toBe(2);
    });

    it("should track local orders independently per secret", async () => {
      // Create updates for secret 1
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "encrypted1");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "encrypted2");

      // Create updates for secret 2
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_2, "encrypted1");

      // Each secret has its own local order counter
      const maxOrder1 = await getMaxLocalOrder(TEST_SECRET_ID_1);
      const maxOrder2 = await getMaxLocalOrder(TEST_SECRET_ID_2);

      expect(maxOrder1).toBe(2);
      expect(maxOrder2).toBe(1);
    });
  });

  describe("createSecretUpdate", () => {
    it("should create update with auto-incremented global order", async () => {
      const update1 = await createSecretUpdate(
        TEST_VAULT_ID,
        TEST_SECRET_ID_1,
        "enc1",
      );
      const update2 = await createSecretUpdate(
        TEST_VAULT_ID,
        TEST_SECRET_ID_1,
        "enc2",
      );
      const update3 = await createSecretUpdate(
        TEST_VAULT_ID,
        TEST_SECRET_ID_2,
        "enc3",
      );

      expect(update1.globalOrder).toBe(1);
      expect(update2.globalOrder).toBe(2);
      expect(update3.globalOrder).toBe(3);
    });

    it("should create update with auto-incremented local order per secret", async () => {
      // Updates for same secret share local order sequence
      const update1 = await createSecretUpdate(
        TEST_VAULT_ID,
        TEST_SECRET_ID_1,
        "enc1",
      );
      const update2 = await createSecretUpdate(
        TEST_VAULT_ID,
        TEST_SECRET_ID_1,
        "enc2",
      );

      // Different secret has its own sequence
      const update3 = await createSecretUpdate(
        TEST_VAULT_ID,
        TEST_SECRET_ID_2,
        "enc3",
      );
      const update4 = await createSecretUpdate(
        TEST_VAULT_ID,
        TEST_SECRET_ID_2,
        "enc4",
      );

      expect(update1.localOrder).toBe(1);
      expect(update2.localOrder).toBe(2);
      expect(update3.localOrder).toBe(1);
      expect(update4.localOrder).toBe(2);
    });

    it("should store encrypted blob correctly", async () => {
      const encryptedData = "base64encodedencrypteddata==";
      const update = await createSecretUpdate(
        TEST_VAULT_ID,
        TEST_SECRET_ID_1,
        encryptedData,
      );

      expect(update.encryptedBlob).toBe(encryptedData);
    });

    it("should generate unique IDs", async () => {
      const update1 = await createSecretUpdate(
        TEST_VAULT_ID,
        TEST_SECRET_ID_1,
        "enc1",
      );
      const update2 = await createSecretUpdate(
        TEST_VAULT_ID,
        TEST_SECRET_ID_1,
        "enc2",
      );

      expect(update1.id).not.toBe(update2.id);
      expect(update1.id).toHaveLength(26); // ULID format
      expect(update2.id).toHaveLength(26);
    });

    it("should set createdAt timestamp", async () => {
      const beforeCreate = new Date();
      const update = await createSecretUpdate(
        TEST_VAULT_ID,
        TEST_SECRET_ID_1,
        "enc",
      );
      const afterCreate = new Date();

      expect(update.createdAt).toBeInstanceOf(Date);
      expect(update.createdAt.getTime()).toBeGreaterThanOrEqual(
        beforeCreate.getTime() - 1000,
      );
      expect(update.createdAt.getTime()).toBeLessThanOrEqual(
        afterCreate.getTime() + 1000,
      );
    });
  });

  describe("getSecretUpdatesSince", () => {
    it("should return updates with globalOrder > sinceGlobalOrder", async () => {
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc1");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc2");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc3");

      const result = await getSecretUpdatesSince(TEST_VAULT_ID, 1, 100);

      expect(result.updates).toHaveLength(2);
      expect(result.updates[0]!.globalOrder).toBe(2);
      expect(result.updates[1]!.globalOrder).toBe(3);
    });

    it("should return empty array when no updates exist", async () => {
      const result = await getSecretUpdatesSince(TEST_VAULT_ID, 0, 100);

      expect(result.updates).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.latestGlobalOrder).toBe(0);
    });

    it("should set hasMore=true when more updates exist", async () => {
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc1");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc2");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc3");

      const result = await getSecretUpdatesSince(TEST_VAULT_ID, 0, 2);

      expect(result.updates).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it("should set hasMore=false when no more updates exist", async () => {
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc1");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc2");

      const result = await getSecretUpdatesSince(TEST_VAULT_ID, 0, 10);

      expect(result.updates).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it("should return latestGlobalOrder", async () => {
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc1");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc2");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc3");

      const result = await getSecretUpdatesSince(TEST_VAULT_ID, 0, 2);

      expect(result.latestGlobalOrder).toBe(3);
    });

    it("should return updates in ascending order", async () => {
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc1");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc2");
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "enc3");

      const result = await getSecretUpdatesSince(TEST_VAULT_ID, 0, 10);

      expect(result.updates[0]!.globalOrder).toBe(1);
      expect(result.updates[1]!.globalOrder).toBe(2);
      expect(result.updates[2]!.globalOrder).toBe(3);
    });

    it("should only return updates for specified vault", async () => {
      // Create test vault for second vault
      await db.insert(TableVault).values({
        id: "01HTEST000000000000000002",
        name: "bob",
        domain: "example2.com",
        vaultPubKeyHash: "test-pubkey-hash-2",
        vaultPubKey: `02${"1".repeat(64)}`,
        hashedLoginKey: "test-hashed-login-key-2",
        encryptedVaultKey: "test-encrypted-vault-key-2",
      });

      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "alice-enc1");
      await createSecretUpdate(
        "01HTEST000000000000000002",
        TEST_SECRET_ID_2,
        "bob-enc1",
      );
      await createSecretUpdate(TEST_VAULT_ID, TEST_SECRET_ID_1, "alice-enc2");

      const result = await getSecretUpdatesSince(TEST_VAULT_ID, 0, 10);

      expect(result.updates).toHaveLength(2);
      expect(result.updates[0]!.encryptedBlob).toBe("alice-enc1");
      expect(result.updates[1]!.encryptedBlob).toBe("alice-enc2");
    });
  });
});
