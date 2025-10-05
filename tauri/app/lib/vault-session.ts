/**
 * Module-level state for tracking unlocked vaults.
 * This allows both React components and loaders to check vault unlock status.
 * Data is stored in-memory only and lost on page refresh (intentional for security).
 */

let unlockedVaultIds: Set<string> = new Set();

export function isVaultUnlocked(vaultId: string): boolean {
  return unlockedVaultIds.has(vaultId);
}

export function markVaultUnlocked(vaultId: string): void {
  unlockedVaultIds.add(vaultId);
}

export function markVaultLocked(vaultId: string): void {
  unlockedVaultIds.delete(vaultId);
}
