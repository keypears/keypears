const BLOCKED_IP_RANGES = [
  /^127\./, // 127.0.0.0/8
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^169\.254\./, // 169.254.0.0/16
  /^0\./, // 0.0.0.0/8
];

function isBlockedIp(ip: string): boolean {
  return BLOCKED_IP_RANGES.some((r) => r.test(ip));
}

/**
 * Fetch a URL with SSRF protection: blocks private IPs, enforces a timeout,
 * and limits response size.
 */
export async function safeFetch(url: string): Promise<Response> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  // Block obvious private hostnames
  if (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    isBlockedIp(hostname)
  ) {
    throw new Error("Blocked: private address");
  }

  // Resolve DNS and check the actual IP
  const { resolve4 } = await import("node:dns/promises");
  try {
    const ips = await resolve4(hostname);
    if (ips.some(isBlockedIp)) {
      throw new Error("Blocked: private address");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Blocked: private address") {
      throw err;
    }
    // DNS resolution failed — let fetch try (it may be an IP literal)
    if (isBlockedIp(hostname)) {
      throw new Error("Blocked: private address", { cause: err });
    }
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    redirect: "error",
  });

  // Limit response size to 1 MB
  const text = await response.text();
  if (text.length > 1_000_000) {
    throw new Error("Response too large");
  }

  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
