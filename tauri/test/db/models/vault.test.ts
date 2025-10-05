import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { initTestDb, resetTestDb, closeTestDb } from "../test-init";
import {
  createVault,
  getVault,
  getVaultByName,
  getVaults,
  countVaults,
  deleteVault,
} from "~app/db/models/vault";

describe("Vault Model", () => {
  // Initialize test database before all tests
  initTestDb();

  beforeEach(() => {
    resetTestDb();
  });

  afterAll(() => {
    closeTestDb();
  });

  describe("createVault", () => {
    it("should create a vault with a name", async () => {
      const vault = await createVault(
        "testvault",
        "0".repeat(64),
        "0".repeat(64),
      );

      expect(vault).toBeDefined();
      expect(vault.id).toBeDefined();
      expect(vault.name).toBe("testvault");
    });

    it("should enforce unique names", async () => {
      await createVault("uniquevault", "0".repeat(64), "0".repeat(64));

      await expect(
        createVault("uniquevault", "0".repeat(64), "0".repeat(64)),
      ).rejects.toThrow();
    });

    it("should reject names that are too short", async () => {
      await expect(
        createVault("ab", "0".repeat(64), "0".repeat(64)),
      ).rejects.toThrow("Vault name must be at least 3 characters");
    });

    it("should reject names that are too long", async () => {
      await expect(
        createVault("a".repeat(21), "0".repeat(64), "0".repeat(64)),
      ).rejects.toThrow("Vault name must be at most 20 characters");
    });

    it("should reject names that start with a number", async () => {
      await expect(
        createVault("1vault", "0".repeat(64), "0".repeat(64)),
      ).rejects.toThrow("Vault name must start with a letter");
    });

    it("should reject names with special characters", async () => {
      await expect(
        createVault("vault-name", "0".repeat(64), "0".repeat(64)),
      ).rejects.toThrow("Vault name must contain only alphanumeric characters");
    });

    it("should accept valid alphanumeric names", async () => {
      const vault = await createVault("vault123", "0".repeat(64), "0".repeat(64));

      expect(vault).toBeDefined();
      expect(vault.name).toBe("vault123");
    });
  });

  describe("getVault", () => {
    it("should retrieve a vault by ID", async () => {
      const created = await createVault("findme", "0".repeat(64), "0".repeat(64));

      const result = await getVault(created.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
      expect(result?.name).toBe("findme");
    });

    it("should return undefined for non-existent ID", async () => {
      const result = await getVault("non-existent-id");

      expect(result).toBeUndefined();
    });
  });

  describe("getVaultByName", () => {
    it("should retrieve a vault by name", async () => {
      const created = await createVault("myvault", "0".repeat(64), "0".repeat(64));

      const result = await getVaultByName("myvault");

      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
      expect(result?.name).toBe("myvault");
    });

    it("should return undefined for non-existent name", async () => {
      const result = await getVaultByName("nonexistent");

      expect(result).toBeUndefined();
    });
  });

  describe("getVaults", () => {
    it("should return all vaults", async () => {
      await createVault("vault1", "0".repeat(64), "0".repeat(64));
      await createVault("vault2", "0".repeat(64), "0".repeat(64));
      await createVault("vault3", "0".repeat(64), "0".repeat(64));

      const result = await getVaults();

      expect(result).toHaveLength(3);
      expect(result.map((v) => v.name)).toContain("vault1");
      expect(result.map((v) => v.name)).toContain("vault2");
      expect(result.map((v) => v.name)).toContain("vault3");
    });

    it("should return empty array when no vaults exist", async () => {
      const result = await getVaults();

      expect(result).toHaveLength(0);
    });
  });

  describe("countVaults", () => {
    it("should return correct count", async () => {
      await createVault("vault1", "0".repeat(64), "0".repeat(64));
      await createVault("vault2", "0".repeat(64), "0".repeat(64));

      const count = await countVaults();

      expect(count).toBe(2);
    });

    it("should return 0 when no vaults exist", async () => {
      const count = await countVaults();

      expect(count).toBe(0);
    });
  });

  describe("deleteVault", () => {
    it("should delete a vault by ID", async () => {
      const vault = await createVault(
        "testdelete",
        "0".repeat(64),
        "0".repeat(64),
      );

      await deleteVault(vault.id);

      const result = await getVault(vault.id);
      expect(result).toBeUndefined();
    });

    it("should decrease vault count after deletion", async () => {
      await createVault("vault1", "0".repeat(64), "0".repeat(64));
      const vault2 = await createVault("vault2", "0".repeat(64), "0".repeat(64));

      await deleteVault(vault2.id);

      const count = await countVaults();
      expect(count).toBe(1);
    });

    it("should not error when deleting non-existent vault", async () => {
      await expect(deleteVault("non-existent-id")).resolves.not.toThrow();
    });
  });
});
