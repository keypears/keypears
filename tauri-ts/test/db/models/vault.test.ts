import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { ulid } from "ulid";
import { initTestDb, resetTestDb, closeTestDb } from "../test-init";
import {
  createVault,
  getVault,
  getVaultByNameAndDomain,
  getVaults,
  countVaults,
  deleteVault,
} from "~app/db/models/vault";

// Helper function to generate test device ID
function testDeviceId(): string {
  return ulid();
}

// Test device description
const TEST_DEVICE_DESCRIPTION = "Test Device";

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
    it("should create a vault with a name and domain", async () => {
      const vault = await createVault(
        ulid(),
        "testvault",
        "keypears.localhost",
        "0".repeat(64),
        "1".repeat(64),
        testDeviceId(),
        TEST_DEVICE_DESCRIPTION,
      );

      expect(vault).toBeDefined();
      expect(vault.id).toBeDefined();
      expect(vault.name).toBe("testvault");
      expect(vault.domain).toBe("keypears.localhost");
    });

    it("should enforce unique name+domain combination", async () => {
      await createVault(ulid(),"uniquevault", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);

      await expect(
        createVault(ulid(),"uniquevault", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION),
      ).rejects.toThrow();
    });

    it("should allow same name on different domains", async () => {
      await createVault(ulid(),"samename", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);
      const vault2 = await createVault(ulid(),"samename", "hevybags.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);

      expect(vault2).toBeDefined();
      expect(vault2.domain).toBe("hevybags.localhost");
    });

    it("should reject names that are too short", async () => {
      await expect(
        createVault(ulid(),"", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION),
      ).rejects.toThrow("Vault name must be at least 1 character");
    });

    it("should reject names that are too long", async () => {
      await expect(
        createVault(ulid(),"a".repeat(31), "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION),
      ).rejects.toThrow("Vault name must be at most 30 characters");
    });

    it("should reject names that start with a number", async () => {
      await expect(
        createVault(ulid(),"1vault", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION),
      ).rejects.toThrow("Vault name must start with a letter");
    });

    it("should reject names with special characters", async () => {
      await expect(
        createVault(ulid(),"vault-name", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION),
      ).rejects.toThrow("Vault name must contain only alphanumeric characters");
    });

    it("should accept valid alphanumeric names", async () => {
      const vault = await createVault(ulid(),"vault123", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);

      expect(vault).toBeDefined();
      expect(vault.name).toBe("vault123");
    });
  });

  describe("getVault", () => {
    it("should retrieve a vault by ID", async () => {
      const created = await createVault(ulid(),"findme", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);

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

  describe("getVaultByNameAndDomain", () => {
    it("should retrieve a vault by name and domain", async () => {
      const created = await createVault(ulid(),"myvault", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);

      const result = await getVaultByNameAndDomain("myvault", "keypears.localhost");

      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
      expect(result?.name).toBe("myvault");
      expect(result?.domain).toBe("keypears.localhost");
    });

    it("should return undefined for non-existent name+domain", async () => {
      const result = await getVaultByNameAndDomain("nonexistent", "keypears.localhost");

      expect(result).toBeUndefined();
    });

    it("should distinguish between domains", async () => {
      const vault1 = await createVault(ulid(),"samename", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);
      await createVault(ulid(),"samename", "hevybags.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);

      const result = await getVaultByNameAndDomain("samename", "keypears.localhost");

      expect(result?.id).toBe(vault1.id);
      expect(result?.domain).toBe("keypears.localhost");
    });
  });

  describe("getVaults", () => {
    it("should return all vaults", async () => {
      await createVault(ulid(),"vault1", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);
      await createVault(ulid(),"vault2", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);
      await createVault(ulid(),"vault3", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);

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
      await createVault(ulid(),"vault1", "0".repeat(64), "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);
      await createVault(ulid(),"vault2", "0".repeat(64), "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);

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
        ulid(),
        "testdelete",
        "keypears.localhost",
        "0".repeat(64),
        "1".repeat(64),
        testDeviceId(),
        TEST_DEVICE_DESCRIPTION,
      );

      await deleteVault(vault.id);

      const result = await getVault(vault.id);
      expect(result).toBeUndefined();
    });

    it("should decrease vault count after deletion", async () => {
      await createVault(ulid(),"vault1", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);
      const vault2 = await createVault(ulid(),"vault2", "keypears.localhost", "0".repeat(64), "1".repeat(64), testDeviceId(), TEST_DEVICE_DESCRIPTION);

      await deleteVault(vault2.id);

      const count = await countVaults();
      expect(count).toBe(1);
    });

    it("should not error when deleting non-existent vault", async () => {
      await expect(deleteVault("non-existent-id")).resolves.not.toThrow();
    });
  });
});
