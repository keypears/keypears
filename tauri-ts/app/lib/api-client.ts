import { createClient } from "@keypears/api-server/client";
import { buildBaseUrl, KeypearsJsonSchema } from "@keypears/lib";

/**
 * Cache for API URLs fetched from keypears.json
 * Key: domain, Value: apiUrl
 */
const apiUrlCache = new Map<string, string>();

/**
 * Fetches the API URL from a domain's .well-known/keypears.json file
 *
 * @param domain - The vault domain (e.g., "keypears.com", "keypears.localhost")
 * @returns The API URL from keypears.json
 * @throws Error if the fetch fails or the response is invalid
 */
export async function fetchApiUrl(domain: string): Promise<string> {
  // Check cache first
  const cached = apiUrlCache.get(domain);
  if (cached) {
    return cached;
  }

  // Build the URL to fetch keypears.json
  const baseUrl = buildBaseUrl(domain);
  const keypearsJsonUrl = `${baseUrl}/.well-known/keypears.json`;

  const response = await fetch(keypearsJsonUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch keypears.json from ${domain}: HTTP ${response.status}`,
    );
  }

  const data: unknown = await response.json();

  // Validate with Zod schema
  const parsed = KeypearsJsonSchema.parse(data);

  // Cache the result
  apiUrlCache.set(domain, parsed.apiUrl);

  return parsed.apiUrl;
}

/**
 * Clears the API URL cache for a specific domain or all domains
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

/**
 * Creates an API client for the specified domain
 * Fetches the API URL from .well-known/keypears.json
 * Optionally includes session token for authenticated vault operations
 *
 * @param domain - The vault domain (e.g., "keypears.com")
 * @param sessionToken - Optional session token (64-char hex) for authenticated operations
 */
export async function createApiClient(
  domain: string,
  sessionToken?: string,
) {
  // Fetch the API URL from keypears.json
  const url = await fetchApiUrl(domain);

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
