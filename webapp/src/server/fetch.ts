import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import {
  federationAuthorityHostname,
  federationAuthorityPort,
  validateFederationAuthority,
  type FederationAuthority,
} from "~/lib/federation-authority";

type LookupAddress = { address: string; family: 4 | 6 };
type LookupFn = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<LookupAddress[]>;

export type SafeFederationFetchOptions = {
  maxResponseBytes?: number;
  timeoutMs?: number;
  lookup?: LookupFn;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    result = (result << 8) + n;
  }
  return result >>> 0;
}

function isIpv4InRange(
  address: number,
  base: number,
  prefixLength: number,
): boolean {
  const mask =
    prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (address & mask) === (base & mask);
}

function isBlockedIpv4(address: string): boolean {
  const n = ipv4ToNumber(address);
  if (n == null) return false;

  const ranges = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const;
  return ranges.some(([base, prefixLength]) =>
    isIpv4InRange(n, ipv4ToNumber(base)!, prefixLength),
  );
}

function ipv6ToBigInt(address: string): bigint | null {
  let normalized = address.toLowerCase();
  const zoneIndex = normalized.indexOf("%");
  if (zoneIndex !== -1) normalized = normalized.slice(0, zoneIndex);

  const ipv4Match = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  let ipv4Groups: string[] = [];
  if (ipv4Match) {
    const ipv4 = ipv4ToNumber(ipv4Match[1]);
    if (ipv4 == null) return null;
    ipv4Groups = [
      ((ipv4 >>> 16) & 0xffff).toString(16),
      (ipv4 & 0xffff).toString(16),
    ];
    normalized =
      normalized.slice(0, -ipv4Match[1].length) + ipv4Groups.join(":");
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (missing < 0) return null;

  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8) return null;

  let result = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    result = (result << 16n) + BigInt(Number.parseInt(group, 16));
  }
  return result;
}

function isIpv6InRange(
  address: bigint,
  base: bigint,
  prefixLength: number,
): boolean {
  const bits = 128n;
  const mask =
    prefixLength === 0
      ? 0n
      : ((1n << BigInt(prefixLength)) - 1n) << (bits - BigInt(prefixLength));
  return (address & mask) === (base & mask);
}

function isBlockedIpv6(address: string): boolean {
  const n = ipv6ToBigInt(address);
  if (n == null) return false;

  const mappedBase = ipv6ToBigInt("::ffff:0:0")!;
  if (isIpv6InRange(n, mappedBase, 96)) {
    return true;
  }

  const ranges = [
    ["::", 128],
    ["::1", 128],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
    ["2001:db8::", 32],
    ["2001::", 32],
    ["2002::", 16],
  ] as const;
  return ranges.some(([base, prefixLength]) =>
    isIpv6InRange(n, ipv6ToBigInt(base)!, prefixLength),
  );
}

export function isBlockedIpAddress(address: string): boolean {
  return isBlockedIpv4(address) || isBlockedIpv6(address);
}

export async function resolveFederationAuthority(
  authority: FederationAuthority,
  options: Pick<SafeFederationFetchOptions, "lookup"> = {},
): Promise<LookupAddress[]> {
  const hostname = federationAuthorityHostname(authority);
  const lookup = options.lookup ?? (dnsLookup as LookupFn);
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error(`No DNS records found for ${hostname}`);
  }

  const blocked = addresses.filter((address) =>
    isBlockedIpAddress(address.address),
  );
  if (blocked.length > 0) {
    throw new Error(`Blocked private or reserved DNS answer for ${hostname}`);
  }

  return addresses;
}

function responseHeaders(headers: Record<string, unknown>): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, String(item));
    } else {
      result.set(key, String(value));
    }
  }
  return result;
}

export async function safeFederationFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: SafeFederationFetchOptions = {},
): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.protocol !== "https:") {
    throw new Error("Federation fetch only supports HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Federation fetch rejects URLs with userinfo");
  }

  const authority = validateFederationAuthority(url.host);
  const [address] = await resolveFederationAuthority(authority, options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : Buffer.from(await request.arrayBuffer());

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "host") headers[key] = value;
    });
    headers.host = authority;

    const req = httpsRequest(
      {
        hostname: address.address,
        port: federationAuthorityPort(authority),
        method: request.method,
        path: `${url.pathname}${url.search}`,
        headers,
        servername: federationAuthorityHostname(authority),
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          reject(new Error("Federation fetch rejects redirects"));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxResponseBytes) {
            req.destroy(new Error("Federation response too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 502,
              statusText: res.statusMessage,
              headers: responseHeaders(res.headers),
            }),
          );
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Federation fetch timed out"));
    });

    const abort = () => req.destroy(new Error("Federation fetch aborted"));
    if (request.signal.aborted) {
      abort();
      return;
    }
    request.signal.addEventListener("abort", abort, { once: true });

    if (body) req.write(body);
    req.end();
  });
}
