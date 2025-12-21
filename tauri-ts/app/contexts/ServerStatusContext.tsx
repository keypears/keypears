import type { JSX } from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  createClientFromDomain,
  type KeypearsClient,
} from "@keypears/api-client";

export interface ServerStatus {
  isOnline: boolean;
  isValidating: boolean;
  error?: string;
  lastChecked?: Date;
}

interface ServerStatusContextValue {
  status: ServerStatus;
  client: KeypearsClient | null;
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
  /** Domain to validate. If not provided, no server validation occurs. */
  domain?: string;
}

/**
 * ServerStatusProvider manages server connectivity status and provides
 * the oRPC client for API calls.
 *
 * - Discovers API URL from keypears.json on the domain
 * - Validates server on mount
 * - Provides manual checkServer() for re-validation
 * - Manages isOnline state based on validation results
 */
export function ServerStatusProvider({
  children,
  domain,
}: ServerStatusProviderProps): JSX.Element {
  const [client, setClient] = useState<KeypearsClient | null>(null);
  const [status, setStatus] = useState<ServerStatus>({
    isOnline: false,
    isValidating: true, // Start validating immediately
  });

  const checkServer = useCallback(async (): Promise<void> => {
    // If no domain provided, skip server validation
    if (!domain) {
      setStatus({
        isOnline: false,
        isValidating: false,
        lastChecked: new Date(),
      });
      return;
    }

    setStatus((prev) => ({ ...prev, isValidating: true }));

    try {
      // Create client from domain - this discovers the API URL from keypears.json
      const newClient = await createClientFromDomain(domain);
      setClient(newClient);

      // Validate the server
      const result = await newClient.validateServer();

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
  }, [domain]);

  // Initial server check on mount
  useEffect(() => {
    void checkServer();
  }, [checkServer]);

  const contextValue = useMemo(
    () => ({
      status,
      client,
      checkServer,
    }),
    [status, client, checkServer],
  );

  return (
    <ServerStatusContext.Provider value={contextValue}>
      {children}
    </ServerStatusContext.Provider>
  );
}
