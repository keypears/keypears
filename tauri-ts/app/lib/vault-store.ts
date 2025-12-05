/**
 * Global Vault Store
 *
 * Module-level state for the currently unlocked vault and session.
 * This allows both clientLoaders and React components to access vault state.
 *
 * Data is stored in-memory only and lost on page refresh (intentional for security).
 */

import type { FixedBuf } from "@keypears/lib";
import {
  encryptPassword as libEncryptPassword,
  decryptPassword as libDecryptPassword,
} from "@keypears/lib";

export interface UnlockedVault {
  vaultId: string;
  vaultName: string;
  vaultDomain: string;
  passwordKey: FixedBuf<32>;
  encryptionKey: FixedBuf<32>;
  loginKey: FixedBuf<32>;
  vaultKey: FixedBuf<32>;
  vaultPublicKey: FixedBuf<33>;
  encryptedVaultKey: string;
  vaultPubKeyHash: string;
  deviceId: string;
  deviceDescription: string | null;
}

export interface SessionState {
  sessionToken: string;
  expiresAt: number;
}

// Module-level state
let activeVault: UnlockedVault | null = null;
let session: SessionState | null = null;

// ============================================================================
// Getters
// ============================================================================

export function getActiveVault(): UnlockedVault | null {
  return activeVault;
}

export function getSession(): SessionState | null {
  return session;
}

export function getSessionToken(): string | null {
  return session?.sessionToken ?? null;
}

export function isSessionExpiringSoon(): boolean {
  if (!session) {
    return false;
  }
  const SESSION_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes
  return session.expiresAt < Date.now() + SESSION_EXPIRY_BUFFER;
}

export function isVaultUnlocked(vaultId?: string): boolean {
  if (!activeVault) return false;
  if (vaultId) return activeVault.vaultId === vaultId;
  return true;
}

export function getVaultKey(): FixedBuf<32> {
  if (!activeVault) {
    throw new Error("No active vault");
  }
  return activeVault.vaultKey;
}

export function getEncryptionKey(): FixedBuf<32> {
  if (!activeVault) {
    throw new Error("No active vault");
  }
  return activeVault.encryptionKey;
}

export function getLoginKey(): FixedBuf<32> {
  if (!activeVault) {
    throw new Error("No active vault");
  }
  return activeVault.loginKey;
}

export function getPasswordKey(): FixedBuf<32> {
  if (!activeVault) {
    throw new Error("No active vault");
  }
  return activeVault.passwordKey;
}

export function getVaultPublicKey(): FixedBuf<33> {
  if (!activeVault) {
    throw new Error("No active vault");
  }
  return activeVault.vaultPublicKey;
}

export function getDeviceId(): string {
  if (!activeVault) {
    throw new Error("No active vault");
  }
  return activeVault.deviceId;
}

// ============================================================================
// Setters
// ============================================================================

export function setActiveVault(vault: UnlockedVault): void {
  activeVault = vault;
}

export function clearActiveVault(): void {
  activeVault = null;
  session = null;
}

export function setSession(sessionToken: string, expiresAt: number): void {
  session = { sessionToken, expiresAt };
}

export function clearSession(): void {
  session = null;
}

// ============================================================================
// Crypto Helpers
// ============================================================================

export function encryptPassword(password: string): string {
  const encryptionKey = getEncryptionKey();
  return libEncryptPassword(password, encryptionKey);
}

export function decryptPassword(encryptedPasswordHex: string): string {
  const encryptionKey = getEncryptionKey();
  return libDecryptPassword(encryptedPasswordHex, encryptionKey);
}
