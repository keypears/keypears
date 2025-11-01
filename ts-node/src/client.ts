import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { router } from "./index.js";

export interface ClientConfig {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Create an oRPC client for the KeyPears Node API
 *
 * @param config - Client configuration
 * @param config.url - Base URL of the API server (e.g., "http://localhost:4273/api")
 * @param config.headers - Optional headers to include in requests (e.g., Authorization)
 * @returns Type-safe client for calling API procedures
 *
 * @example
 * ```typescript
 * const client = createClient({ url: "http://localhost:4273/api" });
 * const result = await client.blake3({ data: "aGVsbG8=" });
 * ```
 */
export function createClient(config: ClientConfig) {
  const link = new RPCLink({
    url: config.url,
    ...(config.headers && { headers: config.headers }),
  });

  return createORPCClient(link);
}
