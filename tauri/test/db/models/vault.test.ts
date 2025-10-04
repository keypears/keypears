import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { getTestDb, resetTestDb, closeTestDb } from "../test-utils";
import { vaults } from "~app/db/schema";
import { eq, count } from "drizzle-orm";

describe("Vault Model", () => {
  const { drizzle: db } = getTestDb();

  beforeEach(() => {
    resetTestDb();
  });

  afterAll(() => {
    closeTestDb();
  });

  describe("createVault", () => {
    it("should create a vault with a name", async () => {
      const result = await db.insert(vaults).values({ name: "test-vault" }).returning();
      const vault = result[0];

      expect(vault).toBeDefined();
      expect(vault.id).toBeDefined();
      expect(vault.name).toBe("test-vault");
    });

    it("should enforce unique names", async () => {
      await db.insert(vaults).values({ name: "unique-vault" }).returning();

      await expect(
        db.insert(vaults).values({ name: "unique-vault" }).returning()
      ).rejects.toThrow();
    });
  });

  describe("getVault", () => {
    it("should retrieve a vault by ID", async () => {
      const created = await db.insert(vaults).values({ name: "find-me" }).returning();
      const createdVault = created[0];

      const result = await db
        .select()
        .from(vaults)
        .where(eq(vaults.id, createdVault.id));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(createdVault.id);
      expect(result[0].name).toBe("find-me");
    });

    it("should return empty array for non-existent ID", async () => {
      const result = await db.select().from(vaults).where(eq(vaults.id, 99999));

      expect(result).toHaveLength(0);
    });
  });

  describe("getVaults", () => {
    it("should return all vaults", async () => {
      await db.insert(vaults).values({ name: "vault1" });
      await db.insert(vaults).values({ name: "vault2" });
      await db.insert(vaults).values({ name: "vault3" });

      const result = await db.select().from(vaults);

      expect(result).toHaveLength(3);
      expect(result.map((v) => v.name)).toContain("vault1");
      expect(result.map((v) => v.name)).toContain("vault2");
      expect(result.map((v) => v.name)).toContain("vault3");
    });

    it("should return empty array when no vaults exist", async () => {
      const result = await db.select().from(vaults);

      expect(result).toHaveLength(0);
    });
  });

  describe("countVaults", () => {
    it("should return correct count", async () => {
      await db.insert(vaults).values({ name: "vault1" });
      await db.insert(vaults).values({ name: "vault2" });

      const result = await db.select({ count: count() }).from(vaults);

      expect(result[0].count).toBe(2);
    });

    it("should return 0 when no vaults exist", async () => {
      const result = await db.select({ count: count() }).from(vaults);

      expect(result[0].count).toBe(0);
    });
  });
});
