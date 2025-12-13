import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { sha256Hash } from "@webbuf/sha256";
import { WebBuf } from "@webbuf/webbuf";
import {
  FixedBuf,
  deriveHashedLoginKey,
  generateId,
  publicKeyCreate,
} from "@keypears/lib";
import { createClient } from "../src/client.js";
import { db } from "../src/db/index.js";
import { TableVault } from "../src/db/schema.js";

// Generate a deterministic test private key and derive public key
const testPrivKey = sha256Hash(WebBuf.fromUtf8("test-vault-privkey"));
const testPubKey = publicKeyCreate(FixedBuf.fromBuf(32, testPrivKey.buf));

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
      const result = await client.api.checkNameAvailability({
        name: "alice",
        domain: "keypears.com",
      });

      expect(result.available).toBe(true);
    });

    it("should return available=false for taken name", async () => {
      // First, register a vault
      const loginKey = sha256Hash(WebBuf.fromUtf8("test-password-key")); // In real app, this is unhashed login key
      const testPubKeyHash = sha256Hash(WebBuf.fromUtf8("test-vault-pubkey"));
      const encryptedVaultKey = sha256Hash(
        WebBuf.fromUtf8("test-encrypted-vault-key"),
      ); // Dummy value for testing
      await client.api.registerVault({
        vaultId: generateId(),
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash.buf.toHex(),
        vaultPubKey: testPubKey.toHex(),
        loginKey: loginKey.buf.toHex(),
        encryptedVaultKey: encryptedVaultKey.buf.toHex(),
      });

      // Then check if name is available
      const result = await client.api.checkNameAvailability({
        name: "alice",
        domain: "keypears.com",
      });

      expect(result.available).toBe(false);
    });

    it("should be per-domain (alice@keypears.com ≠ alice@hevybags.com)", async () => {
      // Register alice@keypears.com
      const loginKey = sha256Hash(WebBuf.fromUtf8("test-password-key")); // In real app, this is unhashed login key
      const testPubKeyHash = sha256Hash(WebBuf.fromUtf8("test-vault-pubkey"));
      const encryptedVaultKey = sha256Hash(
        WebBuf.fromUtf8("test-encrypted-vault-key"),
      ); // Dummy value for testing
      await client.api.registerVault({
        vaultId: generateId(),
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash.buf.toHex(),
        vaultPubKey: testPubKey.toHex(),
        loginKey: loginKey.buf.toHex(),
        encryptedVaultKey: encryptedVaultKey.buf.toHex(),
      });

      // Check availability for alice@keypears.com (should be taken)
      const result1 = await client.api.checkNameAvailability({
        name: "alice",
        domain: "keypears.com",
      });
      expect(result1.available).toBe(false);

      // Check availability for alice@hevybags.com (should be available)
      const result2 = await client.api.checkNameAvailability({
        name: "alice",
        domain: "hevybags.com",
      });
      expect(result2.available).toBe(true);
    });
  });

  describe("registerVault", () => {
    it("should register a new vault successfully", async () => {
      const loginKey = sha256Hash(WebBuf.fromUtf8("test-password-key")); // In real app, this is unhashed login key
      const testPubKeyHash = sha256Hash(WebBuf.fromUtf8("test-vault-pubkey"));
      const encryptedVaultKey = sha256Hash(
        WebBuf.fromUtf8("test-encrypted-vault-key"),
      ); // Dummy value for testing

      const result = await client.api.registerVault({
        vaultId: generateId(),
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash.buf.toHex(),
        vaultPubKey: testPubKey.toHex(),
        loginKey: loginKey.buf.toHex(),
        encryptedVaultKey: encryptedVaultKey.buf.toHex(),
      });

      expect(result.vaultId).toBeDefined();
      expect(result.vaultId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID format
    });

    it("should reject duplicate name+domain combination", async () => {
      const loginKey = sha256Hash(WebBuf.fromUtf8("test-password-key")); // In real app, this is unhashed login key
      const testPubKeyHash1 = sha256Hash(
        WebBuf.fromUtf8("test-vault-pubkey-1"),
      );
      const testPubKeyHash2 = sha256Hash(
        WebBuf.fromUtf8("test-vault-pubkey-2"),
      );
      const encryptedVaultKey = sha256Hash(
        WebBuf.fromUtf8("test-encrypted-vault-key"),
      ); // Dummy value for testing

      // Register first vault
      await client.api.registerVault({
        vaultId: generateId(),
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash1.buf.toHex(),
        vaultPubKey: testPubKey.toHex(),
        loginKey: loginKey.buf.toHex(),
        encryptedVaultKey: encryptedVaultKey.buf.toHex(),
      });

      // Try to register duplicate
      await expect(
        client.api.registerVault({
          vaultId: generateId(),
          name: "alice",
          domain: "keypears.com",
          vaultPubKeyHash: testPubKeyHash2.buf.toHex(),
          vaultPubKey: testPubKey.toHex(),
          loginKey: loginKey.buf.toHex(),
          encryptedVaultKey: encryptedVaultKey.buf.toHex(),
        }),
      ).rejects.toThrow();
    });

    it("should allow same name on different domains", async () => {
      const loginKey = sha256Hash(WebBuf.fromUtf8("test-password-key")); // In real app, this is unhashed login key
      const testPubKeyHash1 = sha256Hash(
        WebBuf.fromUtf8("test-vault-pubkey-1"),
      );
      const testPubKeyHash2 = sha256Hash(
        WebBuf.fromUtf8("test-vault-pubkey-2"),
      );
      const encryptedVaultKey = sha256Hash(
        WebBuf.fromUtf8("test-encrypted-vault-key"),
      ); // Dummy value for testing

      // Register alice@keypears.com
      const result1 = await client.api.registerVault({
        vaultId: generateId(),
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash1.buf.toHex(),
        vaultPubKey: testPubKey.toHex(),
        loginKey: loginKey.buf.toHex(),
        encryptedVaultKey: encryptedVaultKey.buf.toHex(),
      });

      // Register alice@hevybags.com (should succeed)
      const result2 = await client.api.registerVault({
        vaultId: generateId(),
        name: "alice",
        domain: "hevybags.com",
        vaultPubKeyHash: testPubKeyHash2.buf.toHex(),
        vaultPubKey: testPubKey.toHex(),
        loginKey: loginKey.buf.toHex(),
        encryptedVaultKey: encryptedVaultKey.buf.toHex(),
      });

      expect(result1.vaultId).toBeDefined();
      expect(result2.vaultId).toBeDefined();
      expect(result1.vaultId).not.toBe(result2.vaultId);
    });

    it("should reject invalid domain", async () => {
      const loginKey = sha256Hash(WebBuf.fromUtf8("test-password-key")); // In real app, this is unhashed login key
      const testPubKeyHash = sha256Hash(WebBuf.fromUtf8("test-vault-pubkey"));
      const encryptedVaultKey = sha256Hash(
        WebBuf.fromUtf8("test-encrypted-vault-key"),
      ); // Dummy value for testing

      await expect(
        client.api.registerVault({
          vaultId: generateId(),
          name: "alice",
          domain: "evil.com",
          vaultPubKeyHash: testPubKeyHash.buf.toHex(),
          vaultPubKey: testPubKey.toHex(),
          loginKey: loginKey.buf.toHex(),
          encryptedVaultKey: encryptedVaultKey.buf.toHex(),
        }),
      ).rejects.toThrow();
    });

    it("should reject invalid vault name (must start with letter)", async () => {
      const loginKey = sha256Hash(WebBuf.fromUtf8("test-password-key")); // In real app, this is unhashed login key
      const testPubKeyHash = sha256Hash(WebBuf.fromUtf8("test-vault-pubkey"));
      const encryptedVaultKey = sha256Hash(
        WebBuf.fromUtf8("test-encrypted-vault-key"),
      ); // Dummy value for testing

      await expect(
        client.api.registerVault({
          vaultId: generateId(),
          name: "1alice",
          domain: "keypears.com",
          vaultPubKeyHash: testPubKeyHash.buf.toHex(),
          vaultPubKey: testPubKey.toHex(),
          loginKey: loginKey.buf.toHex(),
          encryptedVaultKey: encryptedVaultKey.buf.toHex(),
        }),
      ).rejects.toThrow();
    });

    it("should reject invalid vault name (must be alphanumeric)", async () => {
      const loginKey = sha256Hash(WebBuf.fromUtf8("test-password-key")); // In real app, this is unhashed login key
      const testPubKeyHash = sha256Hash(WebBuf.fromUtf8("test-vault-pubkey"));
      const encryptedVaultKey = sha256Hash(
        WebBuf.fromUtf8("test-encrypted-vault-key"),
      ); // Dummy value for testing

      await expect(
        client.api.registerVault({
          vaultId: generateId(),
          name: "alice_smith",
          domain: "keypears.com",
          vaultPubKeyHash: testPubKeyHash.buf.toHex(),
          vaultPubKey: testPubKey.toHex(),
          loginKey: loginKey.buf.toHex(),
          encryptedVaultKey: encryptedVaultKey.buf.toHex(),
        }),
      ).rejects.toThrow();
    });

    it("should KDF the login key on server (100k rounds)", async () => {
      const loginKey = sha256Hash(WebBuf.fromUtf8("test-password-key")); // In real app, this is unhashed login key
      const vaultId = generateId();
      const expectedServerHashedLoginKey = deriveHashedLoginKey(
        FixedBuf.fromBuf(32, loginKey.buf),
        vaultId,
      );
      const testPubKeyHash = sha256Hash(WebBuf.fromUtf8("test-vault-pubkey"));
      const encryptedVaultKey = sha256Hash(
        WebBuf.fromUtf8("test-encrypted-vault-key"),
      ); // Dummy value for testing

      const result = await client.api.registerVault({
        vaultId,
        name: "alice",
        domain: "keypears.com",
        vaultPubKeyHash: testPubKeyHash.buf.toHex(),
        vaultPubKey: testPubKey.toHex(),
        loginKey: loginKey.buf.toHex(),
        encryptedVaultKey: encryptedVaultKey.buf.toHex(),
      });

      // Query database to verify server KDF'd it (100k rounds)
      const vault = await db
        .select()
        .from(TableVault)
        .where(eq(TableVault.id, result.vaultId))
        .limit(1);

      expect(vault[0]?.hashedLoginKey).toBe(
        expectedServerHashedLoginKey.buf.toHex(),
      );
    });
  });
});
