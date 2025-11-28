import type { JSX } from "react";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
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
  });

  // Create client only on client-side (after hydration)
  useEffect(() => {
    const newClient = createClient({
      url: serverUrl || "http://localhost:4273/api",
      skipValidation: true
    });
    setClient(newClient);
  }, [serverUrl]);

  const checkServer = useCallback(async (): Promise<void> => {
    if (!client) return;

    setStatus((prev) => ({ ...prev, isValidating: true }));

    try {
      const result = await client.validateServer();

      if (result.valid) {
        setStatus({
          isOnline: true,
          isValidating: false,
          lastChecked: new Date(),
        });
      } else {
        setStatus({
          isOnline: false,
          isValidating: false,
          error: result.error,
          lastChecked: new Date(),
        });
      }
    } catch (error) {
      setStatus({
        isOnline: false,
        isValidating: false,
        error: error instanceof Error ? error.message : "Unknown error",
        lastChecked: new Date(),
      });
    }
  }, [client]);

  // Initial validation on mount (after client is created)
  useEffect(() => {
    if (client) {
      checkServer();
    }
  }, [client, checkServer]);

  // Re-validate every 30 seconds
  useEffect(() => {
    if (!client) return;

    const interval = setInterval(() => {
      checkServer();
    }, 30000); // 30 seconds

    return (): void => {
      clearInterval(interval);
    };
  }, [client, checkServer]);

  // Don't render children until client is ready
  if (!client) {
    return <div>Loading...</div>;
  }

  return (
    <ServerStatusContext.Provider value={{ status, client, checkServer }}>
      {children}
    </ServerStatusContext.Provider>
  );
}
