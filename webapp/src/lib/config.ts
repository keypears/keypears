/**
 * Server-side config — reads from environment variables.
 * These values are used to construct addresses and serve keypears.json.
 */

export function getDomain(): string {
  return process.env.KEYPEARS_DOMAIN ?? "keypears.com";
}

export function getApiUrl(): string {
  return process.env.KEYPEARS_API_URL ?? `https://${getDomain()}/api`;
}

/**
 * Construct a KeyPears address from a user name/ID and domain.
 */
export function makeAddress(name: string | number): string {
  return `${name}@${getDomain()}`;
}

/**
 * Parse a KeyPears address into { name, domain }.
 * Accepts any domain — not just our own.
 */
export function parseAddress(address: string): {
  name: string;
  domain: string;
} | null {
  const match = address.match(/^([^@]+)@([^@]+)$/);
  if (!match) return null;
  return { name: match[1], domain: match[2] };
}

/**
 * Parse a local address — must match our domain.
 * Returns the numeric user ID, or null if not a local address.
 */
export function parseLocalAddress(address: string): number | null {
  const parsed = parseAddress(address);
  if (!parsed) return null;
  if (parsed.domain !== getDomain()) return null;
  const id = Number(parsed.name);
  if (Number.isNaN(id)) return null;
  return id;
}
