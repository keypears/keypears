import { blake3Mac } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";

// --- Environment variables ---

function getMasterSecret(): FixedBuf<32> {
  const hex = process.env.KEYPEARS_SECRET;
  if (!hex) throw new Error("KEYPEARS_SECRET env var is required");
  return FixedBuf.fromHex(32, hex);
}

export function getDomain(): string {
  return process.env.KEYPEARS_DOMAIN ?? "keypears.com";
}

export function getApiUrl(): string {
  return process.env.KEYPEARS_API_URL ?? `https://${getDomain()}/api`;
}

// --- Derived secrets ---
// All derived deterministically from KEYPEARS_SECRET using different salts.
// Same secret always produces same keys, even across restarts.

export function getPowSigningKey(): FixedBuf<32> {
  const secret = getMasterSecret();
  return blake3Mac(secret, WebBuf.fromUtf8("keypears pow secret v1"));
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
