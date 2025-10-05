import { createContext, useContext, useState, ReactNode } from "react";
import type { FixedBuf } from "@keypears/lib";

interface UnlockedVault {
  vaultId: string;
  vaultName: string;
  passwordKey: FixedBuf<32>;
}

interface VaultContextType {
  activeVault: UnlockedVault | null;
  unlockedVaults: UnlockedVault[];
  unlockVault: (vaultId: string, vaultName: string, passwordKey: FixedBuf<32>) => void;
  lockVault: (vaultId: string) => void;
  switchVault: (vaultId: string) => void;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [unlockedVaults, setUnlockedVaults] = useState<UnlockedVault[]>([]);
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null);

  const unlockVault = (
    vaultId: string,
    vaultName: string,
    passwordKey: FixedBuf<32>,
  ) => {
    // Check if vault is already unlocked
    const existing = unlockedVaults.find((v) => v.vaultId === vaultId);

    if (!existing) {
      // Add to unlocked vaults
      setUnlockedVaults([...unlockedVaults, { vaultId, vaultName, passwordKey }]);
    }

    // Set as active vault
    setActiveVaultId(vaultId);
  };

  const lockVault = (vaultId: string) => {
    // Remove from unlocked vaults
    setUnlockedVaults(unlockedVaults.filter((v) => v.vaultId !== vaultId));

    // If this was the active vault, clear active vault
    if (activeVaultId === vaultId) {
      // Try to switch to another unlocked vault if available
      const remaining = unlockedVaults.filter((v) => v.vaultId !== vaultId);
      setActiveVaultId(remaining.length > 0 ? remaining[0].vaultId : null);
    }
  };

  const switchVault = (vaultId: string) => {
    // Verify vault is unlocked
    const vault = unlockedVaults.find((v) => v.vaultId === vaultId);
    if (vault) {
      setActiveVaultId(vaultId);
    }
  };

  const activeVault =
    unlockedVaults.find((v) => v.vaultId === activeVaultId) || null;

  return (
    <VaultContext.Provider
      value={{
        activeVault,
        unlockedVaults,
        unlockVault,
        lockVault,
        switchVault,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault(): VaultContextType {
  const context = useContext(VaultContext);
  if (context === undefined) {
    throw new Error("useVault must be used within a VaultProvider");
  }
  return context;
}
