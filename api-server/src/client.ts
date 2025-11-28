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

export interface ClientConfig {
  url?: string;
  headers?: Record<string, string>;
  skipValidation?: boolean; // Skip automatic server validation (for testing or known-good servers)
}

/**
 * Extended client type with validation method
 */
export type KeypearsClient = RouterClient<typeof router> & {
  validateServer: () => Promise<ServerValidationResult>;
};

/**
 * Create an oRPC client for the KeyPears Node API
 *
 * The client automatically validates that the server is a valid KeyPears server
 * before making the first API call by checking /.well-known/keypears.json.
 * Subsequent calls skip validation (cached per client instance).
 *
 * @param config - Client configuration (optional)
 * @param config.url - Base URL of the API server (e.g., "http://localhost:4273/api"). If not provided, will auto-detect from browser location.
 * @param config.headers - Optional headers to include in requests (e.g., Authorization)
 * @param config.skipValidation - Skip automatic server validation (for testing or known-good servers)
 * @returns Type-safe client for calling API procedures, with automatic server validation
 *
 * @example
 * ```typescript
 * // Auto-detect URL from browser (browser only)
 * const client = createClient();
 *
 * // Explicit URL (works in Node.js or browser)
 * const client = createClient({ url: "http://localhost:4273/api" });
 * const result = await client.blake3({ data: "aGVsbG8=" });
 * // Automatically validates server before first call
 *
 * // Manual validation (optional, for UI feedback)
 * const validation = await client.validateServer();
 * if (!validation.valid) {
 *   console.error(`Invalid server: ${validation.error}`);
 * }
 *
 * // Skip validation for testing
 * const testClient = createClient({
 *   url: "http://localhost:4273/api",
 *   skipValidation: true
 * });
 * ```
 */
export function createClient(config?: ClientConfig): KeypearsClient {
  const { url, headers, skipValidation } = config || {};

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

  // Extract base URL (remove /api suffix)
  const baseUrl = apiUrl.replace(/\/api\/?$/, "");

  // Validation state
  let validated = false;
  let validationPromise: Promise<void> | null = null;

  // Automatic validation function
  async function ensureValidated(): Promise<void> {
    if (skipValidation) return;
    if (validated) return;

    // Deduplicate concurrent validation requests
    if (validationPromise) {
      await validationPromise;
      return;
    }

    validationPromise = (async (): Promise<void> => {
      const result = await validateKeypearsServer(baseUrl);
      if (!result.valid) {
        throw new Error(`Invalid KeyPears server: ${result.error}`);
      }
      validated = true;
    })();

    await validationPromise;
  }

  const link = new RPCLink({
    url: apiUrl,
    ...(headers && { headers }),
  });

  const client = createORPCClient(link) as RouterClient<typeof router>;

  // Wrap client with automatic validation using Proxy
  return new Proxy(client, {
    get(target, prop): unknown {
      // Add validateServer method
      if (prop === "validateServer") {
        return (): Promise<ServerValidationResult> => validateKeypearsServer(baseUrl);
      }

      const original = target[prop as keyof typeof target];

      // Only wrap RPC procedure properties (not internal JS methods like toJSON, apply, etc.)
      // RPC procedures are objects with methods, not functions themselves
      if (typeof original === "object" && original !== null) {
        // Wrap the procedure object with validation
        return new Proxy(original, {
          get(procTarget, procProp): unknown {
            const procOriginal = procTarget[procProp as keyof typeof procTarget];

            if (typeof procOriginal === "function") {
              return async (...args: unknown[]) => {
                await ensureValidated();
                return (procOriginal as (...args: unknown[]) => unknown).apply(
                  procTarget,
                  args,
                );
              };
            }

            return procOriginal;
          },
        });
      }

      return original;
    },
  }) as KeypearsClient;
}
