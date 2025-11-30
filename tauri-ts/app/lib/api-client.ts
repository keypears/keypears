import { createClient, buildServerUrl } from "@keypears/api-server/client";

/**
 * Creates an API client for the specified domain
 * Optionally includes session token for authenticated vault operations
 *
 * @param domain - The vault domain (e.g., "keypears.com")
 * @param sessionToken - Optional session token (64-char hex) for authenticated operations
 */
export function createApiClient(
  domain: string,
  sessionToken?: string,
) {
  // Build the server URL using the centralized logic
  const url = buildServerUrl(domain);

  // Prepare headers if session token is provided
  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers["X-Vault-Session-Token"] = sessionToken;
  }

  // Create the API client
  const client = createClient({
    url,
    ...(Object.keys(headers).length > 0 && { headers }),
  });

  return client;
}
