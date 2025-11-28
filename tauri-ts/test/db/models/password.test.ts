import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { initTestDb, resetTestDb, closeTestDb } from "../test-init";
import { createVault } from "~app/db/models/vault";
import {
  createSecretUpdate,
  getSecretUpdates,
  getCurrentSecrets,
  getSecretHistory,
} from "~app/db/models/password";
import { ulid } from "ulid";

describe("Password Model", () => {
  // Initialize test database before all tests
  initTestDb();

  beforeEach(() => {
    resetTestDb();
  });

  afterAll(() => {
    closeTestDb();
  });

  describe("createSecretUpdate", () => {
    it("should create a password update", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId = ulid();

      const update = await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "GitHub Account",
        domain: "github.com",
        username: "alice",
        email: "alice@example.com",
        encryptedNotes: "My dev account",
        encryptedData: "abc123",
      });

      expect(update).toBeDefined();
      expect(update.id).toBeDefined();
      expect(update.vaultId).toBe(vault.id);
      expect(update.secretId).toBe(secretId);
      expect(update.name).toBe("GitHub Account");
      expect(update.domain).toBe("github.com");
      expect(update.username).toBe("alice");
      expect(update.email).toBe("alice@example.com");
      expect(update.encryptedNotes).toBe("My dev account");
      expect(update.encryptedData).toBe("abc123");
      expect(update.deleted).toBe(false);
      expect(update.createdAt).toBeDefined();
    });

    it("should create a password update with minimal fields", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId = ulid();

      const update = await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Simple Password",
        encryptedData: "xyz789",
      });

      expect(update).toBeDefined();
      expect(update.name).toBe("Simple Password");
      expect(update.domain).toBeNull();
      expect(update.username).toBeNull();
      expect(update.email).toBeNull();
      expect(update.encryptedNotes).toBeNull();
      expect(update.encryptedData).toBe("xyz789");
    });

    it("should create a tombstone (deleted) update", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId = ulid();

      const update = await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Deleted Password",
        deleted: true,
      });

      expect(update.deleted).toBe(true);
    });

    it("should accept custom createdAt timestamp", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId = ulid();
      const customTimestamp = Date.now() - 1000000;

      const update = await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Old Password",
        encryptedData: "old123",
        createdAt: customTimestamp,
      });

      expect(update.createdAt).toBe(customTimestamp);
    });
  });

  describe("getSecretUpdates", () => {
    it("should return all updates for a vault", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId1 = ulid();
      const secretId2 = ulid();

      await createSecretUpdate({
        vaultId: vault.id,
        secretId: secretId1,
        name: "Password 1",
        encryptedData: "pass1",
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId: secretId2,
        name: "Password 2",
        encryptedData: "pass2",
      });

      const updates = await getSecretUpdates(vault.id);

      expect(updates).toHaveLength(2);
      expect(updates.map((u) => u.name)).toContain("Password 1");
      expect(updates.map((u) => u.name)).toContain("Password 2");
    });

    it("should return empty array for vault with no passwords", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));

      const updates = await getSecretUpdates(vault.id);

      expect(updates).toHaveLength(0);
    });

    it("should return updates ordered by createdAt descending", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId = ulid();

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 1",
        encryptedData: "v1",
        createdAt: 1000,
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 2",
        encryptedData: "v2",
        createdAt: 2000,
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 3",
        encryptedData: "v3",
        createdAt: 3000,
      });

      const updates = await getSecretUpdates(vault.id);

      expect(updates).toHaveLength(3);
      expect(updates[0].createdAt).toBe(3000);
      expect(updates[1].createdAt).toBe(2000);
      expect(updates[2].createdAt).toBe(1000);
    });
  });

  describe("getCurrentSecrets", () => {
    it("should return only the latest update for each password", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId = ulid();

      // Create multiple updates for the same password
      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 1",
        encryptedData: "v1",
        createdAt: 1000,
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 2",
        encryptedData: "v2",
        createdAt: 2000,
      });

      const latest = await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 3",
        encryptedData: "v3",
        createdAt: 3000,
      });

      const current = await getCurrentSecrets(vault.id);

      expect(current).toHaveLength(1);
      expect(current[0].name).toBe("Version 3");
      expect(current[0].encryptedData).toBe("v3");
      expect(current[0].createdAt).toBe(3000);
      expect(current[0].id).toBe(latest.id);
    });

    it("should handle out-of-order timestamps (eventual consistency)", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId = ulid();

      // Insert in non-chronological order (simulating late arrival)
      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 2",
        encryptedData: "v2",
        createdAt: 2000,
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 1",
        encryptedData: "v1",
        createdAt: 1000,
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 3",
        encryptedData: "v3",
        createdAt: 3000,
      });

      const current = await getCurrentSecrets(vault.id);

      // Should still return the one with the highest timestamp
      expect(current).toHaveLength(1);
      expect(current[0].name).toBe("Version 3");
      expect(current[0].createdAt).toBe(3000);
    });

    it("should include deleted passwords with deleted flag", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId = ulid();

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Active Password",
        encryptedData: "pass1",
        createdAt: 1000,
      });

      // Delete the password (tombstone)
      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Active Password",
        deleted: true,
        createdAt: 2000,
      });

      const current = await getCurrentSecrets(vault.id);

      // Deleted password should still appear with deleted flag
      expect(current).toHaveLength(1);
      expect(current[0].deleted).toBe(true);
      expect(current[0].name).toBe("Active Password");
    });

    it("should handle multiple passwords in one vault", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId1 = ulid();
      const secretId2 = ulid();
      const secretId3 = ulid();

      // Password 1 with multiple versions
      await createSecretUpdate({
        vaultId: vault.id,
        secretId: secretId1,
        name: "GitHub",
        encryptedData: "github1",
        createdAt: 1000,
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId: secretId1,
        name: "GitHub",
        encryptedData: "github2",
        createdAt: 2000,
      });

      // Password 2 with one version
      await createSecretUpdate({
        vaultId: vault.id,
        secretId: secretId2,
        name: "Gmail",
        encryptedData: "gmail1",
        createdAt: 1500,
      });

      // Password 3 with multiple versions, latest is deleted
      await createSecretUpdate({
        vaultId: vault.id,
        secretId: secretId3,
        name: "Twitter",
        encryptedData: "twitter1",
        createdAt: 1000,
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId: secretId3,
        name: "Twitter",
        deleted: true,
        createdAt: 3000,
      });

      const current = await getCurrentSecrets(vault.id);

      // Should return 3 passwords (GitHub, Gmail, and deleted Twitter)
      expect(current).toHaveLength(3);

      const names = current.map((p) => p.name).sort();
      expect(names).toEqual(["GitHub", "Gmail", "Twitter"]);

      const github = current.find((p) => p.name === "GitHub");
      expect(github?.encryptedData).toBe("github2");
      expect(github?.deleted).toBe(false);

      const gmail = current.find((p) => p.name === "Gmail");
      expect(gmail?.encryptedData).toBe("gmail1");
      expect(gmail?.deleted).toBe(false);

      const twitter = current.find((p) => p.name === "Twitter");
      expect(twitter?.deleted).toBe(true);
    });

    it("should return empty array for vault with no passwords", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));

      const current = await getCurrentSecrets(vault.id);

      expect(current).toHaveLength(0);
    });

    it("should return passwords sorted by name", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));

      await createSecretUpdate({
        vaultId: vault.id,
        secretId: ulid(),
        name: "Zebra",
        encryptedData: "z",
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId: ulid(),
        name: "Apple",
        encryptedData: "a",
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId: ulid(),
        name: "Banana",
        encryptedData: "b",
      });

      const current = await getCurrentSecrets(vault.id);

      expect(current.map((p) => p.name)).toEqual(["Apple", "Banana", "Zebra"]);
    });
  });

  describe("getSecretHistory", () => {
    it("should return all updates for a specific password", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId = ulid();

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 1",
        encryptedData: "v1",
        createdAt: 1000,
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 2",
        encryptedData: "v2",
        createdAt: 2000,
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Version 3",
        encryptedData: "v3",
        createdAt: 3000,
      });

      const history = await getSecretHistory(secretId);

      expect(history).toHaveLength(3);
      expect(history[0].createdAt).toBe(3000);
      expect(history[1].createdAt).toBe(2000);
      expect(history[2].createdAt).toBe(1000);
    });

    it("should not return updates from other passwords", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId1 = ulid();
      const secretId2 = ulid();

      await createSecretUpdate({
        vaultId: vault.id,
        secretId: secretId1,
        name: "Password 1",
        encryptedData: "p1",
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId: secretId2,
        name: "Password 2",
        encryptedData: "p2",
      });

      const history = await getSecretHistory(secretId1);

      expect(history).toHaveLength(1);
      expect(history[0].name).toBe("Password 1");
    });
  });

  describe("cascade delete", () => {
    it("should delete all password updates when vault is deleted", async () => {
      const vault = await createVault("testvault1", "0".repeat(64), "0".repeat(64), "1".repeat(64));
      const secretId = ulid();

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Password 1",
        encryptedData: "p1",
      });

      await createSecretUpdate({
        vaultId: vault.id,
        secretId,
        name: "Password 2",
        encryptedData: "p2",
      });

      // Delete the vault
      const { deleteVault } = await import("~app/db/models/vault");
      await deleteVault(vault.id);

      // Password updates should be deleted
      const updates = await getSecretUpdates(vault.id);
      expect(updates).toHaveLength(0);
    });
  });
});
