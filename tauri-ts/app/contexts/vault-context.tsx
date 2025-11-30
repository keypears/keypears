import { createContext, useContext, useState, useRef, useEffect, ReactNode } from "react";
import type { FixedBuf } from "@keypears/lib";
import {
  encryptPassword as libEncryptPassword,
  decryptPassword as libDecryptPassword,
} from "@keypears/lib";
import {
  markVaultUnlocked,
  markVaultLocked,
} from "~app/lib/vault-session";
import {
  startBackgroundSync,
  stopBackgroundSync,
} from "~app/lib/sync-service";

interface UnlockedVault {
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
  deviceId: string; // Device ID for this vault (ULID)
  deviceDescription: string | null; // Auto-detected OS info
}

interface SessionState {
  sessionToken: string; // 64-char hex session token
  expiresAt: number; // Unix milliseconds
}

interface VaultContextType {
  activeVault: UnlockedVault | null;
  session: SessionState | null;
  unlockVault: (
    vaultId: string,
    vaultName: string,
    vaultDomain: string,
    passwordKey: FixedBuf<32>,
    encryptionKey: FixedBuf<32>,
    loginKey: FixedBuf<32>,
    vaultKey: FixedBuf<32>,
    vaultPublicKey: FixedBuf<33>,
    encryptedVaultKey: string,
    vaultPubKeyHash: string,
    deviceId: string,
    deviceDescription: string | null,
  ) => void;
  lockVault: () => void;
  setSession: (sessionToken: string, expiresAt: number) => void;
  clearSession: () => void;
  getSessionToken: () => string | null;
  isSessionExpiringSoon: () => boolean;
  encryptPassword: (password: string) => string;
  decryptPassword: (encryptedPasswordHex: string) => string;
  getPasswordKey: () => FixedBuf<32>;
  getEncryptionKey: () => FixedBuf<32>;
  getLoginKey: () => FixedBuf<32>;
  getVaultKey: () => FixedBuf<32>;
  getVaultPublicKey: () => FixedBuf<33>;
  getDeviceId: () => string;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [activeVault, setActiveVault] = useState<UnlockedVault | null>(null);
  const [session, setSessionState] = useState<SessionState | null>(null);

  // Use a ref to store the session to avoid closure issues
  const sessionRef = useRef<SessionState | null>(null);

  // Keep the ref in sync with the state
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const unlockVault = (
    vaultId: string,
    vaultName: string,
    vaultDomain: string,
    passwordKey: FixedBuf<32>,
    encryptionKey: FixedBuf<32>,
    loginKey: FixedBuf<32>,
    vaultKey: FixedBuf<32>,
    vaultPublicKey: FixedBuf<33>,
    encryptedVaultKey: string,
    vaultPubKeyHash: string,
    deviceId: string,
    deviceDescription: string | null,
  ) => {
    // If there's a currently unlocked vault, lock it first
    if (activeVault) {
      markVaultLocked(activeVault.vaultId);
      stopBackgroundSync();
    }

    // Set the new vault as active (replaces any previous vault)
    setActiveVault({
      vaultId,
      vaultName,
      vaultDomain,
      passwordKey,
      encryptionKey,
      loginKey,
      vaultKey,
      vaultPublicKey,
      encryptedVaultKey,
      vaultPubKeyHash,
      deviceId,
      deviceDescription,
    });

    // Mark as unlocked in shared session state
    markVaultUnlocked(vaultId);

    // Start background sync - use ref to avoid closure issues and pass session info
    startBackgroundSync(vaultId, vaultDomain, vaultKey, () =>
      sessionRef.current ? {
        token: sessionRef.current.sessionToken,
        expiresAt: sessionRef.current.expiresAt
      } : null
    );
  };

  const lockVault = () => {
    if (!activeVault) return;

    // Mark as locked in shared session state
    markVaultLocked(activeVault.vaultId);

    // Stop background sync
    stopBackgroundSync();

    // Clear session token
    setSessionState(null);

    // Clear the active vault
    setActiveVault(null);
  };

  const setSession = (sessionToken: string, expiresAt: number) => {
    setSessionState({ sessionToken, expiresAt });
  };

  const clearSession = () => {
    setSessionState(null);
  };

  const getSessionToken = (): string | null => {
    return sessionRef.current?.sessionToken ?? null;
  };

  const isSessionExpiringSoon = (): boolean => {
    if (!sessionRef.current) {
      return false;
    }
    const SESSION_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes
    return sessionRef.current.expiresAt < Date.now() + SESSION_EXPIRY_BUFFER;
  };

  const getDeviceId = (): string => {
    if (!activeVault) {
      throw new Error("No active vault");
    }
    return activeVault.deviceId;
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

  const getLoginKey = (): FixedBuf<32> => {
    if (!activeVault) {
      throw new Error("No active vault");
    }
    return activeVault.loginKey;
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
        session,
        unlockVault,
        lockVault,
        setSession,
        clearSession,
        getSessionToken,
        isSessionExpiringSoon,
        encryptPassword,
        decryptPassword,
        getPasswordKey,
        getEncryptionKey,
        getLoginKey,
        getVaultKey,
        getVaultPublicKey,
        getDeviceId,
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
