import { createContext, useContext, useState, ReactNode } from "react";
import type { FixedBuf } from "@keypears/lib";
import {
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
  encryptionKey: FixedBuf<32>;
  vaultKey: FixedBuf<32>;
  vaultPublicKey: FixedBuf<33>;
  encryptedVaultKey: string;
  vaultPubKeyHash: string;
}

interface VaultContextType {
  activeVault: UnlockedVault | null;
  unlockVault: (
    vaultId: string,
    vaultName: string,
    vaultDomain: string,
    passwordKey: FixedBuf<32>,
    encryptionKey: FixedBuf<32>,
    vaultKey: FixedBuf<32>,
    vaultPublicKey: FixedBuf<33>,
    encryptedVaultKey: string,
    vaultPubKeyHash: string,
  ) => void;
  lockVault: () => void;
  encryptPassword: (password: string) => string;
  decryptPassword: (encryptedPasswordHex: string) => string;
  getPasswordKey: () => FixedBuf<32>;
  getEncryptionKey: () => FixedBuf<32>;
  getVaultKey: () => FixedBuf<32>;
  getVaultPublicKey: () => FixedBuf<33>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [activeVault, setActiveVault] = useState<UnlockedVault | null>(null);

  const unlockVault = (
    vaultId: string,
    vaultName: string,
    vaultDomain: string,
    passwordKey: FixedBuf<32>,
    encryptionKey: FixedBuf<32>,
    vaultKey: FixedBuf<32>,
    vaultPublicKey: FixedBuf<33>,
    encryptedVaultKey: string,
    vaultPubKeyHash: string,
  ) => {
    // If there's a currently unlocked vault, lock it first
    if (activeVault) {
      markVaultLocked(activeVault.vaultId);
    }

    // Set the new vault as active (replaces any previous vault)
    setActiveVault({
      vaultId,
      vaultName,
      vaultDomain,
      passwordKey,
      encryptionKey,
      vaultKey,
      vaultPublicKey,
      encryptedVaultKey,
      vaultPubKeyHash,
    });

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

  const getEncryptionKey = (): FixedBuf<32> => {
    if (!activeVault) {
      throw new Error("No active vault");
    }
    return activeVault.encryptionKey;
  };

  const getVaultKey = (): FixedBuf<32> => {
    if (!activeVault) {
      throw new Error("No active vault");
    }
    return activeVault.vaultKey;
  };

  const getVaultPublicKey = (): FixedBuf<33> => {
    if (!activeVault) {
      throw new Error("No active vault");
    }
    return activeVault.vaultPublicKey;
  };

  const encryptPassword = (password: string): string => {
    const encryptionKey = getEncryptionKey();
    return libEncryptPassword(password, encryptionKey);
  };

  const decryptPassword = (encryptedPasswordHex: string): string => {
    const encryptionKey = getEncryptionKey();
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
        getEncryptionKey,
        getVaultKey,
        getVaultPublicKey,
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
