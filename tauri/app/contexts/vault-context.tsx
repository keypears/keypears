import { createContext, useContext, useState, ReactNode } from "react";
import type { FixedBuf } from "@keypears/lib";
import {
  deriveEncryptionKey,
  decryptKey,
  encryptPassword as libEncryptPassword,
  decryptPassword as libDecryptPassword,
  WebBuf,
} from "@keypears/lib";
import {
  markVaultUnlocked,
  markVaultLocked,
} from "~app/lib/vault-session";

interface UnlockedVault {
  vaultId: string;
  vaultName: string;
  passwordKey: FixedBuf<32>;
  encryptedVaultKey: string;
}

interface VaultContextType {
  activeVault: UnlockedVault | null;
  unlockVault: (
    vaultId: string,
    vaultName: string,
    passwordKey: FixedBuf<32>,
    encryptedVaultKey: string,
  ) => void;
  lockVault: () => void;
  encryptPassword: (password: string) => string;
  decryptPassword: (encryptedPasswordHex: string) => string;
  getVaultKey: () => FixedBuf<32>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [activeVault, setActiveVault] = useState<UnlockedVault | null>(null);

  const unlockVault = (
    vaultId: string,
    vaultName: string,
    passwordKey: FixedBuf<32>,
    encryptedVaultKey: string,
  ) => {
    // If there's a currently unlocked vault, lock it first
    if (activeVault) {
      markVaultLocked(activeVault.vaultId);
    }

    // Set the new vault as active (replaces any previous vault)
    setActiveVault({ vaultId, vaultName, passwordKey, encryptedVaultKey });

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

  const getVaultKey = (): FixedBuf<32> => {
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

  return (
    <VaultContext.Provider
      value={{
        activeVault,
        unlockVault,
        lockVault,
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
