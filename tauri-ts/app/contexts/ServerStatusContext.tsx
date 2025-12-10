import type { JSX } from "react";
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { createClient, type KeypearsClient } from "@keypears/api-server/client";

export interface ServerStatus {
  isOnline: boolean;
  isValidating: boolean;
  error?: string;
  lastChecked?: Date;
}

interface ServerStatusContextValue {
  status: ServerStatus;
  client: KeypearsClient;
  checkServer: () => Promise<void>;
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
 */
export function ServerStatusProvider({
  children,
  serverUrl,
}: ServerStatusProviderProps): JSX.Element {
  // Create client synchronously - createClient() is a pure function
  const client = useMemo(
    () => createClient({ url: serverUrl || "http://localhost:4273/api" }),
    [serverUrl],
  );

  const [status, setStatus] = useState<ServerStatus>({
    isOnline: false,
    isValidating: false,
  });

  const checkServer = useCallback(async (): Promise<void> => {
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

  // Initial server check on mount
  useEffect(() => {
    checkServer();
  }, [checkServer]);

  return (
    <ServerStatusContext.Provider
      value={{
        status,
        client,
        checkServer,
      }}
    >
      {children}
    </ServerStatusContext.Provider>
  );
}
