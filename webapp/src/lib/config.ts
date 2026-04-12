import { sha256Hmac } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";

// --- Environment variables ---

function getMasterSecret(): FixedBuf<32> {
  const hex = process.env.KEYPEARS_SECRET;
  if (!hex) throw new Error("KEYPEARS_SECRET env var is required");
  return FixedBuf.fromHex(32, hex);
}

/** Address domain — goes after @ in user addresses. */
export function getDomain(): string {
  const d = process.env.KEYPEARS_DOMAIN;
  if (!d) throw new Error("KEYPEARS_DOMAIN env var is required");
  return d;
}

/** API domain — where this server's API runs. */
export function getApiDomain(): string {
  const d = process.env.KEYPEARS_API_DOMAIN;
  if (!d) throw new Error("KEYPEARS_API_DOMAIN env var is required");
  return d;
}

/** Build the API URL from a domain. Always https://{domain}/api. */
export function apiUrlFromDomain(domain: string): string {
  return `https://${domain}/api`;
}

// --- Derived secrets ---
// All derived deterministically from KEYPEARS_SECRET using different salts.
// Same secret always produces same keys, even across restarts.

export function getPowSigningKey(): FixedBuf<32> {
  const secret = getMasterSecret();
  return sha256Hmac(secret.buf, WebBuf.fromUtf8("keypears pow secret v1"));
}

// --- Address utilities ---

export function makeAddress(name: string, domain: string): string {
  return `${name}@${domain}`;
}

export function parseAddress(address: string): {
  name: string;
  domain: string;
} | null {
  const match = address.match(/^([^@]+)@([^@]+)$/);
  if (!match) return null;
  return { name: match[1], domain: match[2] };
}
