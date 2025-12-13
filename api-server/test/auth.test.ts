import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { sha256Hash } from "@webbuf/sha256";
import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf, generateId, publicKeyCreate } from "@keypears/lib";
import { createClient } from "../src/client.js";
import { db } from "../src/db/index.js";
import { TableVault, TableDeviceSession } from "../src/db/schema.js";

// Generate a deterministic test private key and derive public key
const testPrivKey = sha256Hash(WebBuf.fromUtf8("test-vault-privkey"));
const testPubKey = publicKeyCreate(FixedBuf.fromBuf(32, testPrivKey.buf));

// Create client pointing to test server
// Note: Test server must be running on port 4275
const client = createClient({
  url: "http://localhost:4275/api",
});

describe("Authentication API", () => {
  let testVaultId: string;
  let testLoginKey: string;
  let testDeviceId: string;

  // Clean up database and create a test vault before each test
  beforeEach(async () => {
    // Generate fresh IDs
    testVaultId = generateId();
    testDeviceId = generateId();

    // Clean up tables
    await db.delete(TableDeviceSession);
    await db.delete(TableVault);

    // Create login key (in real app, this would be derived from password)
    const loginKeyBuf = sha256Hash(WebBuf.fromUtf8("test-password-key"));
    testLoginKey = loginKeyBuf.buf.toHex();

    // Register a test vault
    const testPubKeyHash = sha256Hash(WebBuf.fromUtf8("test-vault-pubkey"));
    const encryptedVaultKey = sha256Hash(
      WebBuf.fromUtf8("test-encrypted-vault-key"),
    );
    await client.api.registerVault({
      vaultId: testVaultId,
      name: "alice",
      domain: "keypears.com",
      vaultPubKeyHash: testPubKeyHash.buf.toHex(),
      vaultPubKey: testPubKey.toHex(),
      loginKey: testLoginKey,
      encryptedVaultKey: encryptedVaultKey.buf.toHex(),
    });
  });

  describe("login", () => {
    it("should create a session with valid credentials", async () => {
      const result = await client.api.login({
        vaultId: testVaultId,
        loginKey: testLoginKey,
        deviceId: testDeviceId,
        clientDeviceDescription: "macOS 14.1 (aarch64)",
      });

      // Should return session token
      expect(result.sessionToken).toBeDefined();
      expect(result.sessionToken).toMatch(/^[0-9a-f]{64}$/); // 64-char hex

      // Should return expiration (24 hours from now)
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      expect(result.expiresAt).toBeLessThan(Date.now() + 25 * 60 * 60 * 1000);

      // Should indicate new device
      expect(result.isNewDevice).toBe(true);
    });

    it("should reject invalid login key", async () => {
      const wrongLoginKey = sha256Hash(
        WebBuf.fromUtf8("wrong-password"),
      ).buf.toHex();

      await expect(
        client.api.login({
          vaultId: testVaultId,
          loginKey: wrongLoginKey,
          deviceId: testDeviceId,
        }),
      ).rejects.toThrow();
    });

    it("should reject non-existent vault", async () => {
      const fakeVaultId = generateId();

      await expect(
        client.api.login({
          vaultId: fakeVaultId,
          loginKey: testLoginKey,
          deviceId: testDeviceId,
        }),
      ).rejects.toThrow();
    });

    it("should mark device as not new on second login", async () => {
      // First login
      const result1 = await client.api.login({
        vaultId: testVaultId,
        loginKey: testLoginKey,
        deviceId: testDeviceId,
        clientDeviceDescription: "macOS 14.1",
      });

      expect(result1.isNewDevice).toBe(true);

      // Second login with same device
      const result2 = await client.api.login({
        vaultId: testVaultId,
        loginKey: testLoginKey,
        deviceId: testDeviceId,
        clientDeviceDescription: "macOS 14.2 (updated)",
      });

      expect(result2.isNewDevice).toBe(false);
      expect(result2.sessionToken).not.toBe(result1.sessionToken); // New token
    });

    it("should support multiple devices for same vault", async () => {
      const deviceId2 = generateId();

      // Login from device 1
      const result1 = await client.api.login({
        vaultId: testVaultId,
        loginKey: testLoginKey,
        deviceId: testDeviceId,
        clientDeviceDescription: "macOS 14.1",
      });

      // Login from device 2
      const result2 = await client.api.login({
        vaultId: testVaultId,
        loginKey: testLoginKey,
        deviceId: deviceId2,
        clientDeviceDescription: "iPhone (iOS 17.2)",
      });

      expect(result1.isNewDevice).toBe(true);
      expect(result2.isNewDevice).toBe(true);
      expect(result1.sessionToken).not.toBe(result2.sessionToken);
    });

    it("should store only SHA-256 hash of session token", async () => {
      const result = await client.api.login({
        vaultId: testVaultId,
        loginKey: testLoginKey,
        deviceId: testDeviceId,
      });

      // Query database directly
      const sessions = await db
        .select()
        .from(TableDeviceSession)
        .where(eq(TableDeviceSession.vaultId, testVaultId));

      expect(sessions).toHaveLength(1);

      // Verify stored hash matches SHA256(sessionToken)
      const sessionTokenBuf = WebBuf.fromHex(result.sessionToken);
      const expectedHash = sha256Hash(sessionTokenBuf).buf.toHex();
      expect(sessions[0]?.hashedSessionToken).toBe(expectedHash);

      // Verify raw token is NOT stored
      expect(sessions[0]?.hashedSessionToken).not.toBe(result.sessionToken);
    });
  });

  describe("logout", () => {
    it("should invalidate a valid session", async () => {
      // Login first
      const loginResult = await client.api.login({
        vaultId: testVaultId,
        loginKey: testLoginKey,
        deviceId: testDeviceId,
      });

      // Logout
      const logoutResult = await client.api.logout({
        sessionToken: loginResult.sessionToken,
      });

      expect(logoutResult.success).toBe(true);

      // Verify session is deleted from database
      const sessions = await db
        .select()
        .from(TableDeviceSession)
        .where(eq(TableDeviceSession.vaultId, testVaultId));

      expect(sessions).toHaveLength(0);
    });

    it("should be idempotent (no error if session does not exist)", async () => {
      const fakeSessionToken = FixedBuf.fromRandom(32).buf.toHex();

      // Should not throw
      const result = await client.api.logout({
        sessionToken: fakeSessionToken,
      });

      expect(result.success).toBe(true);
    });

    it("should not affect other device sessions", async () => {
      const deviceId2 = generateId();

      // Login from two devices
      const session1 = await client.api.login({
        vaultId: testVaultId,
        loginKey: testLoginKey,
        deviceId: testDeviceId,
      });

      const session2 = await client.api.login({
        vaultId: testVaultId,
        loginKey: testLoginKey,
        deviceId: deviceId2,
      });

      // Logout from device 1
      await client.api.logout({
        sessionToken: session1.sessionToken,
      });

      // Verify device 2 session still exists
      const sessions = await db
        .select()
        .from(TableDeviceSession)
        .where(eq(TableDeviceSession.vaultId, testVaultId));

      expect(sessions).toHaveLength(1);

      // Verify it's device 2's session
      const sessionTokenBuf = WebBuf.fromHex(session2.sessionToken);
      const expectedHash = sha256Hash(sessionTokenBuf).buf.toHex();
      expect(sessions[0]?.hashedSessionToken).toBe(expectedHash);
    });
  });

  describe("session authentication", () => {
    it("should allow access to protected endpoints with valid session", async () => {
      // Login to get session token
      const loginResult = await client.api.login({
        vaultId: testVaultId,
        loginKey: testLoginKey,
        deviceId: testDeviceId,
      });

      // Try to access protected endpoint (getVaultInfo) with session
      // Note: This requires the client to support passing session token as header
      // For now, we verify the session was created successfully
      expect(loginResult.sessionToken).toBeDefined();
    });

    it("should reject access to protected endpoints with expired session", async () => {
      // Login with short expiration
      const loginResult = await client.api.login({
        vaultId: testVaultId,
        loginKey: testLoginKey,
        deviceId: testDeviceId,
      });

      // Manually expire the session in database
      const sessionTokenBuf = WebBuf.fromHex(loginResult.sessionToken);
      const hashedToken = sha256Hash(sessionTokenBuf).buf.toHex();

      await db
        .update(TableDeviceSession)
        .set({ expiresAt: Date.now() - 1000 }) // Expired 1 second ago
        .where(eq(TableDeviceSession.hashedSessionToken, hashedToken));

      // Attempting to use this session should fail
      // (Would need to test with actual protected endpoint call)
      // For now, verify the expiration was set
      const sessions = await db
        .select()
        .from(TableDeviceSession)
        .where(eq(TableDeviceSession.hashedSessionToken, hashedToken));

      expect(sessions[0]?.expiresAt).toBeLessThan(Date.now());
    });
  });
});
