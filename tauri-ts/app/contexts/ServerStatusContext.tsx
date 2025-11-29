import type { JSX } from "react";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { createClient, type KeypearsClient } from "@keypears/api-server/client";
import { syncVault } from "~app/lib/sync";
import type { FixedBuf } from "@keypears/lib";

export interface ServerStatus {
  isOnline: boolean;
  isValidating: boolean;
  error?: string;
  lastChecked?: Date;

  // Sync status
  isSyncing: boolean;
  lastSyncTime: Date | null;
  lastSyncError: string | null;
  updatesReceived: number;
}

interface ServerStatusContextValue {
  status: ServerStatus;
  client: KeypearsClient;
  checkServer: () => Promise<void>;
  registerVaultForSync: (vaultId: string, vaultKey: FixedBuf<32>) => void;
  unregisterVaultForSync: () => void;
  triggerSync: () => Promise<void>;
}

const ServerStatusContext = createContext<ServerStatusContextValue | undefined>(
  undefined,
);

export function useServerStatus(): ServerStatusContextValue {
  const context = useContext(ServerStatusContext);
  if (!context) {
    throw new Error(
      "useServerStatus must be used within a ServerStatusProvider",
    );
  }
  return context;
}

interface ServerStatusProviderProps {
  children: React.ReactNode;
  serverUrl?: string;
}

/**
 * ServerStatusProvider manages server connectivity status and provides
 * the oRPC client for API calls.
 *
 * - Validates server on mount
 * - Provides manual checkServer() for re-validation
 * - Manages isOnline state based on validation results
 * - Re-validates every 30 seconds while mounted
 */
export function ServerStatusProvider({
  children,
  serverUrl,
}: ServerStatusProviderProps): JSX.Element {
  const [client, setClient] = useState<KeypearsClient | null>(null);

  const [status, setStatus] = useState<ServerStatus>({
    isOnline: false,
    isValidating: false,
    isSyncing: false,
    lastSyncTime: null,
    lastSyncError: null,
    updatesReceived: 0,
  });

  // Track currently unlocked vault for automatic sync
  const [activeVault, setActiveVault] = useState<{
    vaultId: string;
    vaultKey: FixedBuf<32>;
  } | null>(null);

  // Create client only on client-side (after hydration)
  useEffect(() => {
    const newClient = createClient({
      url: serverUrl || "http://localhost:4273/api",
    });
    setClient(newClient);
  }, [serverUrl]);

  const checkServer = useCallback(async (): Promise<void> => {
    if (!client) {
      return;
    }

    setStatus((prev) => ({ ...prev, isValidating: true }));

    try {
      const result = await client.validateServer();

      if (result.valid) {
        setStatus((prev) => ({
          ...prev,
          isOnline: true,
          isValidating: false,
          lastChecked: new Date(),
        }));
      } else {
        setStatus((prev) => ({
          ...prev,
          isOnline: false,
          isValidating: false,
          error: result.error,
          lastChecked: new Date(),
        }));
      }
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        isOnline: false,
        isValidating: false,
        error: error instanceof Error ? error.message : "Unknown error",
        lastChecked: new Date(),
      }));
    }
  }, [client]);

  // Sync vault if one is registered and server is online
  const performSync = useCallback(async (): Promise<void> => {
    if (!client || !activeVault || !status.isOnline) {
      return;
    }

    setStatus((prev) => ({ ...prev, isSyncing: true }));

    try {
      const result = await syncVault(
        activeVault.vaultId,
        activeVault.vaultKey,
        client,
      );

      if (result.success) {
        setStatus((prev) => ({
          ...prev,
          isSyncing: false,
          lastSyncTime: new Date(),
          lastSyncError: null,
          updatesReceived: result.updatesReceived || 0,
        }));
      } else {
        setStatus((prev) => ({
          ...prev,
          isSyncing: false,
          lastSyncError: result.error || "Unknown sync error",
        }));
      }
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncError: error instanceof Error ? error.message : "Unknown sync error",
      }));
    }
  }, [client, activeVault, status.isOnline]);

  // Unified poll: check server health, then sync if vault is unlocked
  const pollServerAndSync = useCallback(async (): Promise<void> => {
    await checkServer();
    await performSync();
  }, [checkServer, performSync]);

  // Register vault for automatic sync
  const registerVaultForSync = useCallback((vaultId: string, vaultKey: FixedBuf<32>) => {
    setActiveVault({ vaultId, vaultKey });
  }, []);

  // Unregister vault (on lock)
  const unregisterVaultForSync = useCallback(() => {
    setActiveVault(null);
  }, []);

  // Trigger immediate sync (for after mutations)
  const triggerSync = useCallback(async (): Promise<void> => {
    await performSync();
  }, [performSync]);

  // Initial check and sync on mount (after client is created)
  useEffect(() => {
    if (client) {
      pollServerAndSync();
    }
  }, [client, pollServerAndSync]);

  // Poll server and sync every 5 seconds
  useEffect(() => {
    if (!client) return;

    const interval = setInterval(() => {
      pollServerAndSync();
    }, 5000); // 5 seconds

    return (): void => {
      clearInterval(interval);
    };
  }, [client, pollServerAndSync]);

  // Don't render children until client is ready
  if (!client) {
    return <div>Loading...</div>;
  }

  return (
    <ServerStatusContext.Provider
      value={{
        status,
        client,
        checkServer,
        registerVaultForSync,
        unregisterVaultForSync,
        triggerSync,
      }}
    >
      {children}
    </ServerStatusContext.Provider>
  );
}
