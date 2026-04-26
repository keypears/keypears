import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { sigEd25519MldsaVerify } from "@webbuf/sig-ed25519-mldsa";
import { discoverApiDomain } from "./discover";
import { createKeypearsClient } from "./client";
import { buildCanonicalPayload } from "./canonical";

/**
 * Generate a cryptographically random 32-byte hex string for the `state`
 * parameter. The app stores this in its session before redirecting.
 */
export function generateState(): string {
  return FixedBuf.fromRandom(32).buf.toHex();
}

/**
 * Construct the URL to redirect the user to for signing.
 */
export function buildSignUrl(options: {
  apiDomain: string;
  domain: string;
  redirectUri: string;
  state: string;
  data?: string;
}): string {
  const url = new URL(`https://${options.apiDomain}/sign`);
  url.searchParams.set("type", "sign-in");
  url.searchParams.set("domain", options.domain);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("state", options.state);
  if (options.data !== undefined) {
    url.searchParams.set("data", options.data);
  }
  return url.toString();
}

/**
 * Parse a KeyPears address into name and domain parts.
 */
function parseAddress(address: string): { name: string; domain: string } | null {
  const at = address.indexOf("@");
  if (at < 1 || at === address.length - 1) return null;
  return { name: address.slice(0, at), domain: address.slice(at + 1) };
}

/**
 * Decode a base64url string (no padding) to Uint8Array.
 */
function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify a callback from the /sign page.
 *
 * Validates state, data, and expiry. Fetches the user's public key via
 * federation. Verifies the ML-DSA-65 signature over the canonical payload.
 *
 * Returns the authenticated address on success. Throws on any failure.
 */
export async function verifyCallback(options: {
  params: URLSearchParams | Record<string, string>;
  domain: string;
  state: string;
  data?: string;
}): Promise<{ address: string }> {
  // Extract params
  const get = (key: string): string | null => {
    if (options.params instanceof URLSearchParams) {
      return options.params.get(key);
    }
    return options.params[key] ?? null;
  };

  const error = get("error");
  if (error) {
    throw new Error(`KeyPears auth denied: ${error}`);
  }

  const signature = get("signature");
  const address = get("address");
  const nonce = get("nonce");
  const timestamp = get("timestamp");
  const expires = get("expires");
  const data = get("data");
  const state = get("state");

  if (!signature) throw new Error("Missing signature in callback");
  if (!address) throw new Error("Missing address in callback");
  if (!nonce) throw new Error("Missing nonce in callback");
  if (!timestamp) throw new Error("Missing timestamp in callback");
  if (!expires) throw new Error("Missing expires in callback");
  if (!state) throw new Error("Missing state in callback");

  // Verify state
  if (state !== options.state) {
    throw new Error("State mismatch — possible CSRF attack");
  }

  // Verify data
  if (options.data !== undefined) {
    if (data !== options.data) {
      throw new Error("Data mismatch in callback");
    }
  }

  // Check expiry
  if (new Date(expires) <= new Date()) {
    throw new Error("Signed payload has expired");
  }

  // Reconstruct the canonical payload
  const payload = buildCanonicalPayload({
    type: "sign-in",
    domain: options.domain,
    address,
    nonce,
    timestamp,
    expires,
    data: options.data,
  });

  // Discover the user's API domain and fetch their public key
  const parsed = parseAddress(address);
  if (!parsed) throw new Error("Invalid address format in callback");

  const apiDomain = await discoverApiDomain(parsed.domain);
  const client = createKeypearsClient(apiDomain);
  const result = await client.getPublicKey({ address });
  if (!result.signingPublicKey || !result.ed25519PublicKey) {
    throw new Error(`Public key not found for ${address}`);
  }

  // Verify the composite Ed25519 + ML-DSA-65 signature
  const ed25519Pub = FixedBuf.fromHex(32, result.ed25519PublicKey);
  const verifyingKey = FixedBuf.fromHex(1952, result.signingPublicKey);
  const sig = FixedBuf.fromBuf(3374, WebBuf.fromUint8Array(base64urlDecode(signature)));
  const payloadBytes = WebBuf.fromUtf8(payload);
  const valid = sigEd25519MldsaVerify(ed25519Pub, verifyingKey, payloadBytes, sig);

  if (!valid) {
    throw new Error("Invalid signature — authentication failed");
  }

  return { address };
}
