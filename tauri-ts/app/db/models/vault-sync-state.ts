import { db } from "../index";
import { TableVaultSyncState } from "../schema";
import { eq } from "drizzle-orm";

export interface VaultSyncState {
  vaultId: string;
  lastSyncedGlobalOrder: number;
  lastSyncAttempt: number | null;
  lastSyncSuccess: number | null;
  syncError: string | null;
}

/**
 * Get sync state for a vault
 * Returns undefined if no sync state exists yet
 */
export async function getVaultSyncState(
  vaultId: string,
): Promise<VaultSyncState | undefined> {
  const result = await db
    .select()
    .from(TableVaultSyncState)
    .where(eq(TableVaultSyncState.vaultId, vaultId));

  return result[0];
}

/**
 * Initialize sync state for a new vault
 */
export async function createVaultSyncState(
  vaultId: string,
): Promise<VaultSyncState> {
  await db.insert(TableVaultSyncState).values({
    vaultId,
    lastSyncedGlobalOrder: 0,
    lastSyncAttempt: null,
    lastSyncSuccess: null,
    syncError: null,
  });

  const state = await getVaultSyncState(vaultId);
  if (!state) {
    throw new Error("Failed to create vault sync state");
  }

  return state;
}

/**
 * Update last synced order after successful sync
 */
export async function updateLastSyncedOrder(
  vaultId: string,
  globalOrder: number,
): Promise<void> {
  const now = Date.now();

  await db
    .update(TableVaultSyncState)
    .set({
      lastSyncedGlobalOrder: globalOrder,
      lastSyncSuccess: now,
      lastSyncAttempt: now,
      syncError: null,
    })
    .where(eq(TableVaultSyncState.vaultId, vaultId));
}

/**
 * Record sync attempt (before starting sync)
 */
export async function recordSyncAttempt(vaultId: string): Promise<void> {
  await db
    .update(TableVaultSyncState)
    .set({
      lastSyncAttempt: Date.now(),
    })
    .where(eq(TableVaultSyncState.vaultId, vaultId));
}

/**
 * Record sync error
 */
export async function recordSyncError(
  vaultId: string,
  error: string,
): Promise<void> {
  await db
    .update(TableVaultSyncState)
    .set({
      syncError: error,
      lastSyncAttempt: Date.now(),
    })
    .where(eq(TableVaultSyncState.vaultId, vaultId));
}

/**
 * Clear sync error after successful sync
 */
export async function clearSyncError(vaultId: string): Promise<void> {
  await db
    .update(TableVaultSyncState)
    .set({
      syncError: null,
    })
    .where(eq(TableVaultSyncState.vaultId, vaultId));
}
