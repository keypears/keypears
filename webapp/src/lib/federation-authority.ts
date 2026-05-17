export type FederationAuthority = string & {
  readonly __federationAuthority: unique symbol;
};

const HOSTNAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function isIpv4Literal(hostname: string): boolean {
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d+$/.test(part)) return false;
      const n = Number(part);
      return n >= 0 && n <= 255;
    })
  );
}

export function validateFederationAuthority(
  value: string,
): FederationAuthority {
  if (value !== value.trim()) {
    throw new Error("Federation authority must not include whitespace");
  }
  if (!value) throw new Error("Federation authority is required");
  if (value.includes("://")) {
    throw new Error("Federation authority must not be a full URL");
  }
  if (/[/?#@\\[\]]/.test(value)) {
    throw new Error("Federation authority must be a DNS hostname only");
  }

  const url = new URL(`https://${value}/`);
  if (url.username || url.password) {
    throw new Error("Federation authority must not include userinfo");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Federation authority must use the default HTTPS port");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Federation authority must not be localhost");
  }
  if (hostname.includes(":") || isIpv4Literal(hostname)) {
    throw new Error("Federation authority must be a DNS hostname");
  }
  if (!HOSTNAME_PATTERN.test(hostname)) {
    throw new Error("Federation authority must be a valid DNS hostname");
  }

  return hostname as FederationAuthority;
}

export function federationAuthorityHostname(
  authority: FederationAuthority,
): string {
  return authority;
}

export function federationAuthorityPort(
  _authority: FederationAuthority,
): number {
  return 443;
}

export function federationApiUrl(authority: FederationAuthority): string {
  return `https://${authority}/api`;
}

export function federationWellKnownUrl(
  authority: FederationAuthority,
): string {
  return `https://${authority}/.well-known/keypears.json`;
}

export function isDevTestAuthority(authority: FederationAuthority): boolean {
  return federationAuthorityHostname(authority).endsWith(".test");
}
