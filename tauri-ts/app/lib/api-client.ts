import { createClient, buildServerUrl } from "@keypears/api-server/client";
import type { FixedBuf } from "@keypears/lib";

/**
 * Creates an API client for the specified domain
 * Optionally includes login key for authenticated vault operations
 *
 * @param domain - The vault domain (e.g., "keypears.com")
 * @param loginKey - Optional login key for authenticated operations
 */
export function createApiClient(
  domain: string,
  loginKey?: FixedBuf<32>,
) {
  // Build the server URL using the centralized logic
  const url = buildServerUrl(domain);

  // Prepare headers if login key is provided
  const headers: Record<string, string> = {};
  if (loginKey) {
    headers["X-Vault-Login-Key"] = loginKey.buf.toHex();
  }

  // Create the API client
  const client = createClient({
    url,
    ...(Object.keys(headers).length > 0 && { headers }),
  });

  return client;
}
