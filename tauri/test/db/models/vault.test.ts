import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { initTestDb, resetTestDb, closeTestDb } from "../test-init";
import {
  createVault,
  getVault,
  getVaults,
  countVaults,
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
      const vault = await createVault("testVault");

      expect(vault).toBeDefined();
      expect(vault.id).toBeDefined();
      expect(vault.name).toBe("testVault");
    });

    it("should enforce unique names", async () => {
      await createVault("uniqueVault");

      await expect(createVault("uniqueVault")).rejects.toThrow();
    });

    it("should reject names that are too short", async () => {
      await expect(createVault("ab")).rejects.toThrow(
        "Vault name must be at least 3 characters",
      );
    });

    it("should reject names that are too long", async () => {
      await expect(createVault("a".repeat(21))).rejects.toThrow(
        "Vault name must be at most 20 characters",
      );
    });

    it("should reject names that start with a number", async () => {
      await expect(createVault("1vault")).rejects.toThrow(
        "Vault name must start with a letter",
      );
    });

    it("should reject names with special characters", async () => {
      await expect(createVault("vault-name")).rejects.toThrow(
        "Vault name must contain only alphanumeric characters",
      );
    });

    it("should accept valid alphanumeric names", async () => {
      const vault = await createVault("vault123");

      expect(vault).toBeDefined();
      expect(vault.name).toBe("vault123");
    });
  });

  describe("getVault", () => {
    it("should retrieve a vault by ID", async () => {
      const created = await createVault("findMe");

      const result = await getVault(created.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
      expect(result?.name).toBe("findMe");
    });

    it("should return undefined for non-existent ID", async () => {
      const result = await getVault("non-existent-id");

      expect(result).toBeUndefined();
    });
  });

  describe("getVaults", () => {
    it("should return all vaults", async () => {
      await createVault("vault1");
      await createVault("vault2");
      await createVault("vault3");

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
      await createVault("vault1");
      await createVault("vault2");

      const count = await countVaults();

      expect(count).toBe(2);
    });

    it("should return 0 when no vaults exist", async () => {
      const count = await countVaults();

      expect(count).toBe(0);
    });
  });
});
