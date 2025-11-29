import type { RouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { router } from "./index.js";
import {
  validateKeypearsServer,
  type ServerValidationResult,
} from "./validation.js";

// Re-export schemas for client convenience
export * from "./zod-schemas.js";

// Re-export domain utilities for client convenience
export { buildServerUrl } from "@keypears/lib";

export interface ClientConfig {
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Create an oRPC client for the KeyPears Node API
 *
 * Returns a simple client object with two properties:
 * - `api`: oRPC client with all API procedures (e.g., client.api.blake3(...))
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
 * const result = await client.api.blake3({ data: "aGVsbG8=" });
 *
 * // Validate server explicitly when needed
 * const validation = await client.validateServer();
 * if (!validation.valid) {
 *   console.error(`Invalid server: ${validation.error}`);
 * }
 * ```
 */
export function createClient(config?: ClientConfig) {
  const { url, headers } = config || {};

  // Determine the URL
  let apiUrl: string;

  if (url) {
    // Explicit URL provided
    apiUrl = url;
  } else {
    // Try to auto-detect from browser location
    const win =
      typeof globalThis !== "undefined"
        ? (globalThis as { window?: { location?: { protocol: string; hostname: string; port: string } } }).window
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

  const orpcClient = createORPCClient(link) as RouterClient<typeof router>;

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
 * Structure: { api: RouterClient, validateServer: () => Promise<...> }
 */
export type KeypearsClient = ReturnType<typeof createClient>;
