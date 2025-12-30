/**
 * Global Vault Store
 *
 * Module-level state for unlocked vaults and their sessions.
 * Supports multiple vaults being unlocked simultaneously.
 * This allows both clientLoaders and React components to access vault state.
 *
 * State is persisted to Tauri Rust backend, surviving webview reloads.
 * State is cleared on app restart (keys never written to disk).
 */

import { FixedBuf } from "@webbuf/fixedbuf";
import {
  encryptPassword as libEncryptPassword,
  decryptPassword as libDecryptPassword,
} from "@keypears/lib";
import { invoke } from "@tauri-apps/api/core";

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

// Serialized vault for Rust storage (keys as hex strings)
interface SerializedVault {
  vaultId: string;
  vaultName: string;
  vaultDomain: string;
  passwordKey: string;
  encryptionKey: string;
  loginKey: string;
  vaultKey: string;
  vaultPublicKey: string;
  encryptedVaultKey: string;
  vaultPubKeyHash: string;
  deviceId: string;
  deviceDescription: string | null;
}

// Module-level state - Maps keyed by vaultId (local cache, Rust is source of truth)
const unlockedVaults: Map<string, UnlockedVault> = new Map();
const sessions: Map<string, SessionState> = new Map();

// Track the currently active vault (for detecting vault switches)
let currentVaultId: string | null = null;

// ============================================================================
// Serialization (for Rust persistence)
// ============================================================================

function serializeVault(vault: UnlockedVault): SerializedVault {
  return {
    vaultId: vault.vaultId,
    vaultName: vault.vaultName,
    vaultDomain: vault.vaultDomain,
    passwordKey: vault.passwordKey.buf.toHex(),
    encryptionKey: vault.encryptionKey.buf.toHex(),
    loginKey: vault.loginKey.buf.toHex(),
    vaultKey: vault.vaultKey.buf.toHex(),
    vaultPublicKey: vault.vaultPublicKey.buf.toHex(),
    encryptedVaultKey: vault.encryptedVaultKey,
    vaultPubKeyHash: vault.vaultPubKeyHash,
    deviceId: vault.deviceId,
    deviceDescription: vault.deviceDescription,
  };
}

function deserializeVault(data: SerializedVault): UnlockedVault {
  return {
    vaultId: data.vaultId,
    vaultName: data.vaultName,
    vaultDomain: data.vaultDomain,
    passwordKey: FixedBuf.fromHex(32, data.passwordKey),
    encryptionKey: FixedBuf.fromHex(32, data.encryptionKey),
    loginKey: FixedBuf.fromHex(32, data.loginKey),
    vaultKey: FixedBuf.fromHex(32, data.vaultKey),
    vaultPublicKey: FixedBuf.fromHex(33, data.vaultPublicKey),
    encryptedVaultKey: data.encryptedVaultKey,
    vaultPubKeyHash: data.vaultPubKeyHash,
    deviceId: data.deviceId,
    deviceDescription: data.deviceDescription,
  };
}

// ============================================================================
// Rust State Sync
// ============================================================================

/**
 * Load all state from Rust backend into local cache.
 * Called on app init and each poll tick.
 */
export async function loadStateFromRust(): Promise<void> {
  try {
    const vaults = await invoke<Record<string, SerializedVault>>(
      "get_all_unlocked_vaults",
    );
    const storedSessions = await invoke<Record<string, SessionState>>(
      "get_all_sessions",
    );

    unlockedVaults.clear();
    sessions.clear();

    for (const [id, vault] of Object.entries(vaults)) {
      unlockedVaults.set(id, deserializeVault(vault));
    }
    for (const [id, session] of Object.entries(storedSessions)) {
      sessions.set(id, session);
    }
  } catch (error) {
    console.error("Failed to load state from Rust:", error);
  }
}

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
 * Get all unlocked vaults.
 */
export function getAllUnlockedVaults(): UnlockedVault[] {
  return Array.from(unlockedVaults.values());
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
 * Check if a session is expired.
 */
export function isSessionExpired(session: SessionState): boolean {
  return session.expiresAt < Date.now();
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
 * Persists to Rust backend.
 */
export async function unlockVault(vault: UnlockedVault): Promise<void> {
  // Persist to Rust (source of truth)
  await invoke("store_unlocked_vault", { vault: serializeVault(vault) });
  // Update local cache
  unlockedVaults.set(vault.vaultId, vault);
}

/**
 * Lock a vault (remove from unlocked vaults and clear its session).
 * Persists to Rust backend.
 */
export async function lockVault(vaultId: string): Promise<void> {
  // Remove from Rust (source of truth)
  await invoke("remove_unlocked_vault", { vaultId });
  await invoke("remove_session", { vaultId });
  // Update local cache
  unlockedVaults.delete(vaultId);
  sessions.delete(vaultId);
}

/**
 * Lock all vaults (clear all unlocked vaults and sessions).
 * Persists to Rust backend.
 */
export async function lockAllVaults(): Promise<void> {
  // Remove all from Rust
  const vaultIds = Array.from(unlockedVaults.keys());
  for (const vaultId of vaultIds) {
    await invoke("remove_unlocked_vault", { vaultId });
    await invoke("remove_session", { vaultId });
  }
  // Clear local cache
  unlockedVaults.clear();
  sessions.clear();
}

/**
 * Set session for a specific vault.
 * Persists to Rust backend.
 */
export async function setSession(
  vaultId: string,
  sessionToken: string,
  expiresAt: number,
): Promise<void> {
  // Persist to Rust (source of truth)
  await invoke("store_session", {
    vaultId,
    session: { sessionToken, expiresAt },
  });
  // Update local cache
  sessions.set(vaultId, { sessionToken, expiresAt });
}

/**
 * Clear session for a specific vault.
 * Persists to Rust backend.
 */
export async function clearSession(vaultId: string): Promise<void> {
  // Remove from Rust
  await invoke("remove_session", { vaultId });
  // Update local cache
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
export async function setActiveVault(vault: UnlockedVault): Promise<void> {
  await unlockVault(vault);
}

/**
 * @deprecated Use lockVault(vaultId) instead
 * Clear the active vault (for backward compatibility during migration).
 */
export async function clearActiveVault(): Promise<void> {
  // This clears ALL vaults - deprecated behavior
  await lockAllVaults();
}
