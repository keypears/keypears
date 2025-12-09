import { describe, it, expect, beforeEach } from "vitest";
import { ulid } from "ulid";
import { sha256Hash } from "@webbuf/sha256";
import { WebBuf } from "@webbuf/webbuf";
import {
  createOrUpdateDeviceSession,
  getDeviceSessionByHashedToken,
  deleteDeviceSessionByHashedToken,
  updateDeviceSessionActivity,
  getDeviceSessionsByVaultId,
} from "../src/db/models/device-session.js";
import { db } from "../src/db/index.js";
import { TableDeviceSession, TableVault } from "../src/db/schema.js";

describe("Device Session Model", () => {
  let testVaultId: string;
  let testDeviceId1: string;
  let testDeviceId2: string;

  beforeEach(async () => {
    // Generate fresh IDs for each test
    testVaultId = ulid();
    testDeviceId1 = ulid();
    testDeviceId2 = ulid();

    // Clean up tables
    await db.delete(TableDeviceSession);
    await db.delete(TableVault);

    // Create a test vault with explicit timestamps
    const now = new Date();
    await db.insert(TableVault).values({
      id: testVaultId,
      name: "alice",
      domain: "keypears.com",
      vaultPubKeyHash: sha256Hash(WebBuf.fromUtf8("test-pubkey")).buf.toHex(),
      hashedLoginKey: sha256Hash(WebBuf.fromUtf8("test-login-key")).buf.toHex(),
      encryptedVaultKey: sha256Hash(WebBuf.fromUtf8("test-vault-key")).buf.toHex(),
      createdAt: now,
      updatedAt: now,
    });
  });

  describe("createOrUpdateDeviceSession", () => {
    it("should create a new device session", async () => {
      const hashedToken = sha256Hash(WebBuf.fromUtf8("test-token")).buf.toHex();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      const result = await createOrUpdateDeviceSession(
        testVaultId,
        testDeviceId1,
        hashedToken,
        expiresAt,
        "macOS 14.1 (aarch64)",
      );

      expect(result.isNewDevice).toBe(true);
      expect(result.vaultId).toBe(testVaultId);
      expect(result.deviceId).toBe(testDeviceId1);
      expect(result.hashedSessionToken).toBe(hashedToken);
      expect(result.expiresAt).toBe(expiresAt);
      expect(result.clientDeviceDescription).toBe("macOS 14.1 (aarch64)");
      expect(result.serverDeviceName).toBeNull();
    });

    it("should update existing device session", async () => {
      const hashedToken1 = sha256Hash(WebBuf.fromUtf8("token-1")).buf.toHex();
      const hashedToken2 = sha256Hash(WebBuf.fromUtf8("token-2")).buf.toHex();
      const expiresAt1 = Date.now() + 1000;
      const expiresAt2 = Date.now() + 24 * 60 * 60 * 1000;

      // Create initial session
      const result1 = await createOrUpdateDeviceSession(
        testVaultId,
        testDeviceId1,
        hashedToken1,
        expiresAt1,
        "macOS 14.1",
      );

      expect(result1.isNewDevice).toBe(true);

      // Update session with new token
      const result2 = await createOrUpdateDeviceSession(
        testVaultId,
        testDeviceId1,
        hashedToken2,
        expiresAt2,
        "macOS 14.2 (updated)",
      );

      expect(result2.isNewDevice).toBe(false);
      expect(result2.id).toBe(result1.id); // Same session ID
      expect(result2.hashedSessionToken).toBe(hashedToken2); // Updated token
      expect(result2.expiresAt).toBe(expiresAt2); // Updated expiration
      expect(result2.clientDeviceDescription).toBe("macOS 14.2 (updated)");
    });

    it("should support multiple devices for same vault", async () => {
      const hashedToken1 = sha256Hash(WebBuf.fromUtf8("device-1-token")).buf.toHex();
      const hashedToken2 = sha256Hash(WebBuf.fromUtf8("device-2-token")).buf.toHex();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create session for device 1
      const result1 = await createOrUpdateDeviceSession(
        testVaultId,
        testDeviceId1,
        hashedToken1,
        expiresAt,
        "macOS 14.1",
      );

      // Create session for device 2
      const result2 = await createOrUpdateDeviceSession(
        testVaultId,
        testDeviceId2,
        hashedToken2,
        expiresAt,
        "iPhone (iOS 17.2)",
      );

      expect(result1.isNewDevice).toBe(true);
      expect(result2.isNewDevice).toBe(true);
      expect(result1.id).not.toBe(result2.id);
      expect(result1.deviceId).toBe(testDeviceId1);
      expect(result2.deviceId).toBe(testDeviceId2);
    });
  });

  describe("getDeviceSessionByHashedToken", () => {
    it("should retrieve session by hashed token", async () => {
      const hashedToken = sha256Hash(WebBuf.fromUtf8("test-token")).buf.toHex();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create session
      await createOrUpdateDeviceSession(
        testVaultId,
        testDeviceId1,
        hashedToken,
        expiresAt,
      );

      // Retrieve by hashed token
      const session = await getDeviceSessionByHashedToken(hashedToken);

      expect(session).not.toBeNull();
      expect(session?.hashedSessionToken).toBe(hashedToken);
      expect(session?.vaultId).toBe(testVaultId);
      expect(session?.deviceId).toBe(testDeviceId1);
    });

    it("should return null for non-existent token", async () => {
      const fakeHashedToken = sha256Hash(WebBuf.fromUtf8("fake-token")).buf.toHex();

      const session = await getDeviceSessionByHashedToken(fakeHashedToken);

      expect(session).toBeNull();
    });
  });

  describe("deleteDeviceSessionByHashedToken", () => {
    it("should delete session by hashed token", async () => {
      const hashedToken = sha256Hash(WebBuf.fromUtf8("test-token")).buf.toHex();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create session
      await createOrUpdateDeviceSession(
        testVaultId,
        testDeviceId1,
        hashedToken,
        expiresAt,
      );

      // Verify it exists
      let session = await getDeviceSessionByHashedToken(hashedToken);
      expect(session).not.toBeNull();

      // Delete session
      await deleteDeviceSessionByHashedToken(hashedToken);

      // Verify it's gone
      session = await getDeviceSessionByHashedToken(hashedToken);
      expect(session).toBeNull();
    });

    it("should not error when deleting non-existent session", async () => {
      const fakeHashedToken = sha256Hash(WebBuf.fromUtf8("fake-token")).buf.toHex();

      // Should not throw
      await expect(
        deleteDeviceSessionByHashedToken(fakeHashedToken),
      ).resolves.not.toThrow();
    });
  });

  describe("updateDeviceSessionActivity", () => {
    it("should update lastActivityAt timestamp", async () => {
      const hashedToken = sha256Hash(WebBuf.fromUtf8("test-token")).buf.toHex();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create session
      const result = await createOrUpdateDeviceSession(
        testVaultId,
        testDeviceId1,
        hashedToken,
        expiresAt,
      );

      const originalActivityAt = result.lastActivityAt;

      // Wait a bit
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 100);
      });

      // Update activity
      await updateDeviceSessionActivity(result.id);

      // Fetch again
      const updated = await getDeviceSessionByHashedToken(hashedToken);

      expect(updated).not.toBeNull();
      expect(updated!.lastActivityAt.getTime()).toBeGreaterThan(
        originalActivityAt.getTime(),
      );
    });
  });

  describe("getDeviceSessionsByVaultId", () => {
    it("should return all sessions for a vault", async () => {
      const hashedToken1 = sha256Hash(WebBuf.fromUtf8("device-1-token")).buf.toHex();
      const hashedToken2 = sha256Hash(WebBuf.fromUtf8("device-2-token")).buf.toHex();
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      // Create sessions for two devices
      await createOrUpdateDeviceSession(
        testVaultId,
        testDeviceId1,
        hashedToken1,
        expiresAt,
      );
      await createOrUpdateDeviceSession(
        testVaultId,
        testDeviceId2,
        hashedToken2,
        expiresAt,
      );

      const sessions = await getDeviceSessionsByVaultId(testVaultId);

      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.deviceId).sort()).toEqual(
        [testDeviceId1, testDeviceId2].sort(),
      );
    });

    it("should return empty array for vault with no sessions", async () => {
      const emptyVaultId = ulid();
      const now = new Date();

      // Create another vault without sessions
      await db.insert(TableVault).values({
        id: emptyVaultId,
        name: "bob",
        domain: "keypears.com",
        vaultPubKeyHash: sha256Hash(WebBuf.fromUtf8("bob-pubkey")).buf.toHex(),
        hashedLoginKey: sha256Hash(WebBuf.fromUtf8("bob-login-key")).buf.toHex(),
        encryptedVaultKey: sha256Hash(WebBuf.fromUtf8("bob-vault-key")).buf.toHex(),
        createdAt: now,
        updatedAt: now,
      });

      const sessions = await getDeviceSessionsByVaultId(emptyVaultId);

      expect(sessions).toHaveLength(0);
    });
  });
});
