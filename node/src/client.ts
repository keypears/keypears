import type { RouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { router } from "./index.js";

export interface ClientConfig {
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Create an oRPC client for the KeyPears Node API
 *
 * @param config - Client configuration (optional)
 * @param config.url - Base URL of the API server (e.g., "http://localhost:4273/api"). If not provided, will auto-detect from browser location.
 * @param config.headers - Optional headers to include in requests (e.g., Authorization)
 * @returns Type-safe client for calling API procedures
 *
 * @example
 * ```typescript
 * // Auto-detect URL from browser (browser only)
 * const client = createClient();
 *
 * // Explicit URL (works in Node.js or browser)
 * const client = createClient({ url: "http://localhost:4273/api" });
 * const result = await client.blake3({ data: "aGVsbG8=" });
 * ```
 */
export function createClient(config?: ClientConfig): RouterClient<typeof router> {
  const { url, headers } = config || {};

  // Determine the URL
  let apiUrl: string;

  if (url) {
    // Explicit URL provided
    apiUrl = url;
  } else {
    // Try to auto-detect from browser location
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = typeof globalThis !== "undefined" ? (globalThis as any).window : undefined;
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

  const link = new RPCLink({
    url: apiUrl,
    ...(headers && { headers }),
  });

  return createORPCClient(link) as RouterClient<typeof router>;
}
