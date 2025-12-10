/**
 * Official KeyPears domains for production and development
 */

export const OFFICIAL_DOMAINS = {
  production: ["keypears.com", "hevybags.com", "wokerium.com"],
  development: [
    "keypears.localhost",
    "hevybags.localhost",
    "wokerium.localhost",
  ],
} as const;

/**
 * Port mapping for development domains
 * Each domain gets a unique port (+10 increments for auxiliary services)
 */
export const DEV_PORT_MAP = {
  "keypears.localhost": 4273,
  "hevybags.localhost": 4283,
  "wokerium.localhost": 4293,
} as const;

/**
 * Get the list of official domains based on environment
 * @returns Array of official domain names
 */
export function getOfficialDomains(): string[] {
  // Check if we're in a browser environment with import.meta.env
  // Use unknown and type guard to check for env.MODE property
  const isDev =
    typeof import.meta !== "undefined" &&
    typeof (import.meta as unknown as { env?: { MODE?: string } }).env ===
      "object" &&
    (import.meta as unknown as { env: { MODE?: string } }).env.MODE ===
      "development";

  return isDev
    ? [...OFFICIAL_DOMAINS.development]
    : [...OFFICIAL_DOMAINS.production];
}

/**
 * Check if a domain is an official KeyPears domain
 * @param domain - Domain to check
 * @returns True if domain is official
 */
export function isOfficialDomain(domain: string): boolean {
  const allDomains: string[] = [
    ...OFFICIAL_DOMAINS.production,
    ...OFFICIAL_DOMAINS.development,
  ];
  return allDomains.includes(domain);
}

/**
 * Get the port for a development domain
 * @param domain - Development domain
 * @returns Port number or undefined for production domains
 */
export function getDevPort(domain: string): number | undefined {
  // Type guard to check if domain is a valid dev port key
  const isDevDomain = (d: string): d is keyof typeof DEV_PORT_MAP => {
    return d in DEV_PORT_MAP;
  };

  if (isDevDomain(domain)) {
    return DEV_PORT_MAP[domain];
  }
  return undefined;
}

/**
 * Build the base URL (without /api path) for a domain
 *
 * @param domain - The vault's domain (e.g., 'keypears.com', 'keypears.localhost', 'localhost:4273')
 * @returns Base URL with protocol (no trailing slash)
 *
 * @example
 * buildBaseUrl('keypears.com') // 'https://keypears.com'
 * buildBaseUrl('keypears.localhost') // 'http://keypears.localhost:4273'
 * buildBaseUrl('localhost:4273') // 'http://localhost:4273'
 */
export function buildBaseUrl(domain: string): string {
  // Check if it's a development domain with mapped port
  const devPort = getDevPort(domain);
  if (devPort !== undefined) {
    return `http://${domain}:${devPort}`;
  }

  // Check if domain already includes a port (custom development)
  if (domain.includes(":")) {
    return `http://${domain}`;
  }

  // Production domain - use https
  return `https://${domain}`;
}

/**
 * Build the server URL for API calls based on the vault's domain
 *
 * @deprecated Use fetchApiUrl() to get the API URL from keypears.json instead.
 * This function is kept for backwards compatibility and testing.
 *
 * @param domain - The vault's domain (e.g., 'keypears.com', 'keypears.localhost', 'localhost:4273')
 * @returns Full server URL with protocol and /api path
 *
 * @example
 * buildServerUrl('keypears.com') // 'https://keypears.com/api'
 * buildServerUrl('keypears.localhost') // 'http://keypears.localhost:4273/api'
 * buildServerUrl('localhost:4273') // 'http://localhost:4273/api'
 */
export function buildServerUrl(domain: string): string {
  return `${buildBaseUrl(domain)}/api`;
}
