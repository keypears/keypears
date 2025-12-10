/**
 * Global Vault Store
 *
 * Module-level state for unlocked vaults and their sessions.
 * Supports multiple vaults being unlocked simultaneously.
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

// Module-level state - Maps keyed by vaultId
const unlockedVaults: Map<string, UnlockedVault> = new Map();
const sessions: Map<string, SessionState> = new Map();

// Track the currently active vault (for detecting vault switches)
let currentVaultId: string | null = null;

// ============================================================================
// Getters
// ============================================================================

/**
 * Get an unlocked vault by ID.
 * Returns null if the vault is not unlocked.
 */
export function getUnlockedVault(vaultId: string): UnlockedVault | null {
  return unlockedVaults.get(vaultId) ?? null;
}

/**
 * Get all unlocked vault IDs.
 */
export function getAllUnlockedVaultIds(): string[] {
  return Array.from(unlockedVaults.keys());
}

/**
 * Get session for a specific vault.
 */
export function getSession(vaultId: string): SessionState | null {
  return sessions.get(vaultId) ?? null;
}

/**
 * Get session token for a specific vault.
 */
export function getSessionToken(vaultId: string): string | null {
  return sessions.get(vaultId)?.sessionToken ?? null;
}

/**
 * Check if a specific vault's session is expiring soon.
 */
export function isSessionExpiringSoon(vaultId: string): boolean {
  const session = sessions.get(vaultId);
  if (!session) {
    return false;
  }
  const SESSION_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes
  return session.expiresAt < Date.now() + SESSION_EXPIRY_BUFFER;
}

/**
 * Check if a vault is unlocked.
 */
export function isVaultUnlocked(vaultId: string): boolean {
  return unlockedVaults.has(vaultId);
}

/**
 * Get the currently active vault ID.
 */
export function getCurrentVaultId(): string | null {
  return currentVaultId;
}

/**
 * Get the vault key for a specific vault.
 * Throws if vault is not unlocked.
 */
export function getVaultKey(vaultId: string): FixedBuf<32> {
  const vault = unlockedVaults.get(vaultId);
  if (!vault) {
    throw new Error(`Vault ${vaultId} is not unlocked`);
  }
  return vault.vaultKey;
}

/**
 * Get the encryption key for a specific vault.
 * Throws if vault is not unlocked.
 */
export function getEncryptionKey(vaultId: string): FixedBuf<32> {
  const vault = unlockedVaults.get(vaultId);
  if (!vault) {
    throw new Error(`Vault ${vaultId} is not unlocked`);
  }
  return vault.encryptionKey;
}

/**
 * Get the login key for a specific vault.
 * Throws if vault is not unlocked.
 */
export function getLoginKey(vaultId: string): FixedBuf<32> {
  const vault = unlockedVaults.get(vaultId);
  if (!vault) {
    throw new Error(`Vault ${vaultId} is not unlocked`);
  }
  return vault.loginKey;
}

/**
 * Get the password key for a specific vault.
 * Throws if vault is not unlocked.
 */
export function getPasswordKey(vaultId: string): FixedBuf<32> {
  const vault = unlockedVaults.get(vaultId);
  if (!vault) {
    throw new Error(`Vault ${vaultId} is not unlocked`);
  }
  return vault.passwordKey;
}

/**
 * Get the vault public key for a specific vault.
 * Throws if vault is not unlocked.
 */
export function getVaultPublicKey(vaultId: string): FixedBuf<33> {
  const vault = unlockedVaults.get(vaultId);
  if (!vault) {
    throw new Error(`Vault ${vaultId} is not unlocked`);
  }
  return vault.vaultPublicKey;
}

/**
 * Get the device ID for a specific vault.
 * Throws if vault is not unlocked.
 */
export function getDeviceId(vaultId: string): string {
  const vault = unlockedVaults.get(vaultId);
  if (!vault) {
    throw new Error(`Vault ${vaultId} is not unlocked`);
  }
  return vault.deviceId;
}

// ============================================================================
// Setters
// ============================================================================

/**
 * Unlock a vault (add to unlocked vaults).
 */
export function unlockVault(vault: UnlockedVault): void {
  unlockedVaults.set(vault.vaultId, vault);
}

/**
 * Lock a vault (remove from unlocked vaults and clear its session).
 */
export function lockVault(vaultId: string): void {
  unlockedVaults.delete(vaultId);
  sessions.delete(vaultId);
}

/**
 * Lock all vaults (clear all unlocked vaults and sessions).
 */
export function lockAllVaults(): void {
  unlockedVaults.clear();
  sessions.clear();
}

/**
 * Set session for a specific vault.
 */
export function setSession(
  vaultId: string,
  sessionToken: string,
  expiresAt: number,
): void {
  sessions.set(vaultId, { sessionToken, expiresAt });
}

/**
 * Clear session for a specific vault.
 */
export function clearSession(vaultId: string): void {
  sessions.delete(vaultId);
}

/**
 * Switch to a vault. Returns true if this is a different vault than the current one.
 * Use this to detect vault switches and update lastAccessedAt accordingly.
 */
export function switchToVault(vaultId: string): boolean {
  if (currentVaultId === vaultId) {
    return false; // Same vault, no switch
  }
  currentVaultId = vaultId;
  return true; // Different vault, switch occurred
}

// ============================================================================
// Crypto Helpers
// ============================================================================

/**
 * Encrypt a password using a specific vault's encryption key.
 */
export function encryptPassword(vaultId: string, password: string): string {
  const encryptionKey = getEncryptionKey(vaultId);
  return libEncryptPassword(password, encryptionKey);
}

/**
 * Decrypt a password using a specific vault's encryption key.
 */
export function decryptPassword(
  vaultId: string,
  encryptedPasswordHex: string,
): string {
  const encryptionKey = getEncryptionKey(vaultId);
  return libDecryptPassword(encryptedPasswordHex, encryptionKey);
}

// ============================================================================
// Backward Compatibility (DEPRECATED - to be removed after migration)
// ============================================================================

/**
 * @deprecated Use getUnlockedVault(vaultId) instead
 * Get the first unlocked vault (for backward compatibility during migration).
 */
export function getActiveVault(): UnlockedVault | null {
  const firstKey = unlockedVaults.keys().next().value;
  if (firstKey === undefined) return null;
  return unlockedVaults.get(firstKey) ?? null;
}

/**
 * @deprecated Use unlockVault(vault) instead
 * Set the active vault (for backward compatibility during migration).
 */
export function setActiveVault(vault: UnlockedVault): void {
  unlockVault(vault);
}

/**
 * @deprecated Use lockVault(vaultId) instead
 * Clear the active vault (for backward compatibility during migration).
 */
export function clearActiveVault(): void {
  // This clears ALL vaults - deprecated behavior
  lockAllVaults();
}
