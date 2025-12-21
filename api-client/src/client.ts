import type { ContractRouterClient } from "@orpc/contract";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { Contract } from "./contract.js";
import {
  validateKeypearsServer,
  fetchKeypearsJson,
  type ServerValidationResult,
} from "./validation.js";
import { buildBaseUrl } from "@keypears/lib";

// ============================================================================
// API URL Cache
// ============================================================================

/**
 * Cache for discovered API URLs (domain -> apiUrl)
 * This avoids fetching .well-known/keypears.json on every client creation
 */
const apiUrlCache = new Map<string, string>();

/**
 * Clear the API URL cache for a specific domain or all domains.
 * Useful for testing or after encountering errors.
 *
 * @param domain - Optional domain to clear. If not provided, clears all cached URLs.
 */
export function clearApiUrlCache(domain?: string): void {
  if (domain) {
    apiUrlCache.delete(domain);
  } else {
    apiUrlCache.clear();
  }
}

export interface ClientConfig {
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Create an oRPC client for the KeyPears Node API
 *
 * Returns a simple client object with two properties:
 * - `api`: oRPC client with all API procedures (e.g., client.api.checkNameAvailability(...))
 * - `validateServer`: Function to validate the server (client.validateServer())
 *
 * @param config - Client configuration (optional)
 * @param config.url - Base URL of the API server (e.g., "http://localhost:4273/api"). If not provided, will auto-detect from browser location.
 * @param config.headers - Optional headers to include in requests (e.g., Authorization)
 * @returns Client object with { api, validateServer }
 *
 * @example
 * ```typescript
 * // Auto-detect URL from browser (browser only)
 * const client = createClient();
 *
 * // Explicit URL (works in Node.js or browser)
 * const client = createClient({ url: "http://localhost:4273/api" });
 *
 * // Call API methods under .api namespace
 * const result = await client.api.checkNameAvailability({ name: "alice", domain: "keypears.com" });
 *
 * // Validate server explicitly when needed
 * const validation = await client.validateServer();
 * if (!validation.valid) {
 *   console.error(`Invalid server: ${validation.error}`);
 * }
 * ```
 */
export function createClient(config?: ClientConfig): {
  api: ContractRouterClient<Contract>;
  validateServer: () => Promise<ServerValidationResult>;
} {
  const { url, headers } = config ?? {};

  // Determine the URL
  let apiUrl: string;

  if (url) {
    // Explicit URL provided
    apiUrl = url;
  } else {
    // Try to auto-detect from browser location
    const win =
      typeof globalThis !== "undefined"
        ? (
            globalThis as {
              window?: {
                location?: { protocol: string; hostname: string; port: string };
              };
            }
          ).window
        : undefined;
    if (win?.location) {
      const { protocol, hostname, port } = win.location;
      const portStr = port ? `:${port}` : "";
      apiUrl = `${protocol}//${hostname}${portStr}/api`;
    } else {
      // Neither URL provided nor browser context
      throw new Error(
        "Cannot create oRPC client: No URL provided and not running in a browser.",
      );
    }
  }

  // Extract base URL (remove /api suffix) for validateServer
  const baseUrl = apiUrl.replace(/\/api\/?$/, "");

  const link = new RPCLink({
    url: apiUrl,
    ...(headers && { headers }),
  });

  const orpcClient: ContractRouterClient<Contract> = createORPCClient(link);

  // Return simple object with api namespace and validateServer function
  return {
    api: orpcClient,
    validateServer: async (): Promise<ServerValidationResult> => {
      return await validateKeypearsServer(baseUrl);
    },
  };
}

/**
 * KeypearsClient type - inferred from the actual return type of createClient
 * Structure: { api: ContractRouterClient<Contract>, validateServer: () => Promise<...> }
 */
export type KeypearsClient = ReturnType<typeof createClient>;

// ============================================================================
// Domain-based Client Creation
// ============================================================================

export interface ClientFromDomainOptions {
  /**
   * Session token for authenticated requests.
   * This is the 64-character hex token returned from the login procedure.
   */
  sessionToken?: string;

  /**
   * Timeout for fetching .well-known/keypears.json in milliseconds.
   * Default: 5000ms
   */
  timeout?: number;
}

/**
 * Create a KeyPears client from a domain name.
 *
 * This is the recommended way to create a client when you know the domain
 * (e.g., "keypears.com") but not the API URL. The function automatically
 * discovers the API URL by fetching .well-known/keypears.json.
 *
 * The discovered API URL is cached to avoid repeated fetches.
 *
 * @param domain - The KeyPears domain (e.g., "keypears.com", "keypears.localhost")
 * @param options - Optional configuration
 * @param options.sessionToken - Session token for authenticated requests
 * @param options.timeout - Timeout for discovery in milliseconds (default: 5000)
 * @returns Promise resolving to a KeypearsClient
 * @throws Error if the server cannot be reached or is not a valid KeyPears server
 *
 * @example
 * ```typescript
 * // Unauthenticated client (for login, registration, public endpoints)
 * const client = await createClientFromDomain("keypears.com");
 * const vaultInfo = await client.api.getVaultInfoPublic({ name: "alice", domain: "keypears.com" });
 *
 * // Authenticated client (after login)
 * const authedClient = await createClientFromDomain("keypears.com", {
 *   sessionToken: loginResponse.sessionToken
 * });
 * await authedClient.api.createSecretUpdate({ ... });
 * ```
 */
export async function createClientFromDomain(
  domain: string,
  options: ClientFromDomainOptions = {},
): Promise<KeypearsClient> {
  const { sessionToken, timeout } = options;

  // Check cache first
  let apiUrl = apiUrlCache.get(domain);

  if (!apiUrl) {
    // Discover API URL via .well-known/keypears.json
    const baseUrl = buildBaseUrl(domain);
    const result = await fetchKeypearsJson(baseUrl, { timeout });

    if (!result.success) {
      // Provide user-friendly error message with domain context
      throw new Error(`${result.error} (${domain})`);
    }

    apiUrl = result.apiUrl;
    apiUrlCache.set(domain, apiUrl);
  }

  // Build headers with session token if provided
  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers["X-Vault-Session-Token"] = sessionToken;
  }

  // Create and return the client
  return createClient({
    url: apiUrl,
    ...(Object.keys(headers).length > 0 && { headers }),
  });
}
