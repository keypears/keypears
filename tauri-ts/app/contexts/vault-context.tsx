import { createContext, useContext, useState, ReactNode } from "react";
import type { FixedBuf } from "@keypears/lib";
import {
  deriveEncryptionKey,
  encryptPassword as libEncryptPassword,
  decryptPassword as libDecryptPassword,
} from "@keypears/lib";
import {
  markVaultUnlocked,
  markVaultLocked,
} from "~app/lib/vault-session";

interface UnlockedVault {
  vaultId: string;
  vaultName: string;
  vaultDomain: string;
  passwordKey: FixedBuf<32>;
  encryptedPasswordKey: string;
}

interface VaultContextType {
  activeVault: UnlockedVault | null;
  unlockVault: (
    vaultId: string,
    vaultName: string,
    vaultDomain: string,
    passwordKey: FixedBuf<32>,
    encryptedPasswordKey: string,
  ) => void;
  lockVault: () => void;
  encryptPassword: (password: string) => string;
  decryptPassword: (encryptedPasswordHex: string) => string;
  getPasswordKey: () => FixedBuf<32>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [activeVault, setActiveVault] = useState<UnlockedVault | null>(null);

  const unlockVault = (
    vaultId: string,
    vaultName: string,
    vaultDomain: string,
    passwordKey: FixedBuf<32>,
    encryptedPasswordKey: string,
  ) => {
    // If there's a currently unlocked vault, lock it first
    if (activeVault) {
      markVaultLocked(activeVault.vaultId);
    }

    // Set the new vault as active (replaces any previous vault)
    setActiveVault({ vaultId, vaultName, vaultDomain, passwordKey, encryptedPasswordKey });

    // Mark as unlocked in shared session state
    markVaultUnlocked(vaultId);
  };

  const lockVault = () => {
    if (!activeVault) return;

    // Mark as locked in shared session state
    markVaultLocked(activeVault.vaultId);

    // Clear the active vault
    setActiveVault(null);
  };

  const getPasswordKey = (): FixedBuf<32> => {
    if (!activeVault) {
      throw new Error("No active vault");
    }

    return activeVault.passwordKey;
  };

  const encryptPassword = (password: string): string => {
    const passwordKey = getPasswordKey();
    // Derive encryption key from password key to encrypt secrets
    const encryptionKey = deriveEncryptionKey(passwordKey);
    return libEncryptPassword(password, encryptionKey);
  };

  const decryptPassword = (encryptedPasswordHex: string): string => {
    const passwordKey = getPasswordKey();
    // Derive encryption key from password key to decrypt secrets
    const encryptionKey = deriveEncryptionKey(passwordKey);
    return libDecryptPassword(encryptedPasswordHex, encryptionKey);
  };

  return (
    <VaultContext.Provider
      value={{
        activeVault,
        unlockVault,
        lockVault,
        encryptPassword,
        decryptPassword,
        getPasswordKey,
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
