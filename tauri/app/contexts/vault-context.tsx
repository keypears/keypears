import { createContext, useContext, useState, ReactNode } from "react";
import type { FixedBuf } from "@keypears/lib";
import {
  deriveEncryptionKey,
  decryptKey,
  encryptPassword as libEncryptPassword,
  decryptPassword as libDecryptPassword,
  WebBuf,
} from "@keypears/lib";

interface UnlockedVault {
  vaultId: string;
  vaultName: string;
  passwordKey: FixedBuf<32>;
  encryptedVaultKey: string;
}

interface VaultContextType {
  activeVault: UnlockedVault | null;
  unlockedVaults: UnlockedVault[];
  unlockVault: (
    vaultId: string,
    vaultName: string,
    passwordKey: FixedBuf<32>,
    encryptedVaultKey: string,
  ) => void;
  lockVault: (vaultId: string) => void;
  switchVault: (vaultId: string) => void;
  encryptPassword: (password: string) => string;
  decryptPassword: (encryptedPasswordHex: string) => string;
  getVaultKey: () => FixedBuf<32>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [unlockedVaults, setUnlockedVaults] = useState<UnlockedVault[]>([]);
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null);

  const unlockVault = (
    vaultId: string,
    vaultName: string,
    passwordKey: FixedBuf<32>,
    encryptedVaultKey: string,
  ) => {
    // Check if vault is already unlocked
    const existing = unlockedVaults.find((v) => v.vaultId === vaultId);

    if (!existing) {
      // Add to unlocked vaults
      setUnlockedVaults([
        ...unlockedVaults,
        { vaultId, vaultName, passwordKey, encryptedVaultKey },
      ]);
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

  const getVaultKey = (): FixedBuf<32> => {
    const activeVault =
      unlockedVaults.find((v) => v.vaultId === activeVaultId) || null;

    if (!activeVault) {
      throw new Error("No active vault");
    }

    // Derive encryption key from password key
    const encryptionKey = deriveEncryptionKey(activeVault.passwordKey);

    // Decrypt vault key
    const encryptedVaultKeyBuf = WebBuf.fromHex(
      activeVault.encryptedVaultKey,
    );
    const vaultKey = decryptKey(encryptedVaultKeyBuf, encryptionKey);

    return vaultKey;
  };

  const encryptPassword = (password: string): string => {
    const vaultKey = getVaultKey();
    return libEncryptPassword(password, vaultKey);
  };

  const decryptPassword = (encryptedPasswordHex: string): string => {
    const vaultKey = getVaultKey();
    return libDecryptPassword(encryptedPasswordHex, vaultKey);
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
        encryptPassword,
        decryptPassword,
        getVaultKey,
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
