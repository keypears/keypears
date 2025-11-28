import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { blake3Hash } from "@webbuf/blake3";
import { WebBuf } from "@webbuf/webbuf";
import { createClient } from "../src/client.js";
import { db } from "../src/db/index.js";
import { TableVault } from "../src/db/schema.js";

// Create client pointing to test server
// Note: Test server must be running on port 4275
const client = createClient({
  url: "http://localhost:4275/api",
});

describe("Vault API", () => {
  // Clean up database before each test
  beforeEach(async () => {
    await db.delete(TableVault);
  });

  describe("checkNameAvailability", () => {
    it("should return available=true for unused name", async () => {
      const result = await client.checkNameAvailability({
        name: "alice",
        domain: "keypears.com",
      });

      expect(result.available).toBe(true);
    });

    it("should return available=false for taken name", async () => {
      // First, register a vault
      const loginKeyHash = blake3Hash(WebBuf.fromUtf8("test-password-key"));
      const testPubKeyHash = blake3Hash(WebBuf.fromUtf8("test-vault-pubkey"));
      await client.registerVault({
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash.buf.toHex(),
        hashedLoginKey: loginKeyHash.buf.toHex(),
      });

      // Then check if name is available
      const result = await client.checkNameAvailability({
        name: "alice",
        domain: "keypears.com",
      });

      expect(result.available).toBe(false);
    });

    it("should be per-domain (alice@keypears.com ≠ alice@hevybags.com)", async () => {
      // Register alice@keypears.com
      const loginKeyHash = blake3Hash(WebBuf.fromUtf8("test-password-key"));
      const testPubKeyHash = blake3Hash(WebBuf.fromUtf8("test-vault-pubkey"));
      await client.registerVault({
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash.buf.toHex(),
        hashedLoginKey: loginKeyHash.buf.toHex(),
      });

      // Check availability for alice@keypears.com (should be taken)
      const result1 = await client.checkNameAvailability({
        name: "alice",
        domain: "keypears.com",
      });
      expect(result1.available).toBe(false);

      // Check availability for alice@hevybags.com (should be available)
      const result2 = await client.checkNameAvailability({
        name: "alice",
        domain: "hevybags.com",
      });
      expect(result2.available).toBe(true);
    });
  });

  describe("registerVault", () => {
    it("should register a new vault successfully", async () => {
      const loginKeyHash = blake3Hash(WebBuf.fromUtf8("test-password-key"));
      const testPubKeyHash = blake3Hash(WebBuf.fromUtf8("test-vault-pubkey"));

      const result = await client.registerVault({
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash.buf.toHex(),
        hashedLoginKey: loginKeyHash.buf.toHex(),
      });

      expect(result.vaultId).toBeDefined();
      expect(result.vaultId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID format
    });

    it("should reject duplicate name+domain combination", async () => {
      const loginKeyHash = blake3Hash(WebBuf.fromUtf8("test-password-key"));
      const testPubKeyHash1 = blake3Hash(WebBuf.fromUtf8("test-vault-pubkey-1"));
      const testPubKeyHash2 = blake3Hash(WebBuf.fromUtf8("test-vault-pubkey-2"));

      // Register first vault
      await client.registerVault({
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash1.buf.toHex(),
        hashedLoginKey: loginKeyHash.buf.toHex(),
      });

      // Try to register duplicate
      await expect(
        client.registerVault({
          name: "alice",
          domain: "keypears.com",
          vaultPubKeyHash: testPubKeyHash2.buf.toHex(),
          hashedLoginKey: loginKeyHash.buf.toHex(),
        }),
      ).rejects.toThrow();
    });

    it("should allow same name on different domains", async () => {
      const loginKeyHash = blake3Hash(WebBuf.fromUtf8("test-password-key"));
      const testPubKeyHash1 = blake3Hash(WebBuf.fromUtf8("test-vault-pubkey-1"));
      const testPubKeyHash2 = blake3Hash(WebBuf.fromUtf8("test-vault-pubkey-2"));

      // Register alice@keypears.com
      const result1 = await client.registerVault({
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash1.buf.toHex(),
        hashedLoginKey: loginKeyHash.buf.toHex(),
      });

      // Register alice@hevybags.com (should succeed)
      const result2 = await client.registerVault({
        name: "alice",
        domain: "hevybags.com",
        vaultPubKeyHash: testPubKeyHash2.buf.toHex(),
        hashedLoginKey: loginKeyHash.buf.toHex(),
      });

      expect(result1.vaultId).toBeDefined();
      expect(result2.vaultId).toBeDefined();
      expect(result1.vaultId).not.toBe(result2.vaultId);
    });

    it("should reject invalid domain", async () => {
      const loginKeyHash = blake3Hash(WebBuf.fromUtf8("test-password-key"));
      const testPubKeyHash = blake3Hash(WebBuf.fromUtf8("test-vault-pubkey"));

      await expect(
        client.registerVault({
          name: "alice",
          domain: "evil.com",
          vaultPubKeyHash: testPubKeyHash.buf.toHex(),
          hashedLoginKey: loginKeyHash.buf.toHex(),
        }),
      ).rejects.toThrow();
    });

    it("should reject invalid vault name (must start with letter)", async () => {
      const loginKeyHash = blake3Hash(WebBuf.fromUtf8("test-password-key"));
      const testPubKeyHash = blake3Hash(WebBuf.fromUtf8("test-vault-pubkey"));

      await expect(
        client.registerVault({
          name: "1alice",
          domain: "keypears.com",
          vaultPubKeyHash: testPubKeyHash.buf.toHex(),
          hashedLoginKey: loginKeyHash.buf.toHex(),
        }),
      ).rejects.toThrow();
    });

    it("should reject invalid vault name (must be alphanumeric)", async () => {
      const loginKeyHash = blake3Hash(WebBuf.fromUtf8("test-password-key"));
      const testPubKeyHash = blake3Hash(WebBuf.fromUtf8("test-vault-pubkey"));

      await expect(
        client.registerVault({
          name: "alice_smith",
          domain: "keypears.com",
          vaultPubKeyHash: testPubKeyHash.buf.toHex(),
          hashedLoginKey: loginKeyHash.buf.toHex(),
        }),
      ).rejects.toThrow();
    });

    it("should double-hash the login key on server", async () => {
      const loginKeyHash = blake3Hash(WebBuf.fromUtf8("test-password-key"));
      const expectedServerHash = blake3Hash(loginKeyHash.buf);
      const testPubKeyHash = blake3Hash(WebBuf.fromUtf8("test-vault-pubkey"));

      const result = await client.registerVault({
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash.buf.toHex(),
        hashedLoginKey: loginKeyHash.buf.toHex(),
      });

      // Query database to verify server hashed it again
      const vault = await db
        .select()
        .from(TableVault)
        .where(eq(TableVault.id, result.vaultId))
        .limit(1);

      expect(vault[0]?.hashedLoginKey).toBe(expectedServerHash.buf.toHex());
    });
  });
});
