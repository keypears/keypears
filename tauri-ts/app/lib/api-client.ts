import { createClient, buildServerUrl } from "@keypears/api-server/client";

/**
 * Creates an API client for the specified domain
 * Uses buildServerUrl for consistent URL construction across the app
 */
export function createApiClient(domain: string) {
  // Build the server URL using the centralized logic
  const url = buildServerUrl(domain);

  // Create the API client
  const client = createClient({
    url,
  });

  return client;
}
