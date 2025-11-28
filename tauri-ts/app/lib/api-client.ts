import { createClient } from "@keypears/api-server/client";
import { getDevPort } from "@keypears/lib";

/**
 * Creates an API client for the specified domain
 * Uses dev port mapping for localhost domains in development
 */
export function createApiClient(domain: string) {
  // Determine the port based on domain
  const port = getDevPort(domain) || 4273;

  // Create the API client
  const client = createClient({
    url: `http://${domain}:${port}/api`,
  });

  return client;
}
