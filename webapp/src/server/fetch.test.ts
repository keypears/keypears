import { describe, expect, it } from "vitest";
import { validateFederationAuthority } from "~/lib/federation-authority";
import {
  isBlockedIpAddress,
  resolveFederationAuthority,
  type SafeFederationFetchOptions,
} from "./fetch";

const lookup =
  (addresses: { address: string; family: 4 | 6 }[]) =>
  async (): ReturnType<NonNullable<SafeFederationFetchOptions["lookup"]>> =>
    addresses;

describe("federation authority validation", () => {
  it("normalizes valid hostnames", () => {
    expect(validateFederationAuthority("API.Example.COM")).toBe(
      "api.example.com",
    );
    expect(validateFederationAuthority("api.example.com:443")).toBe(
      "api.example.com",
    );
  });

  it("rejects URLs and non-authority input", () => {
    for (const value of [
      "https://api.example.com",
      "user@api.example.com",
      "api.example.com/path",
      "api.example.com?x=1",
      "api.example.com#hash",
      " api.example.com",
      "api.example.com ",
    ]) {
      expect(() => validateFederationAuthority(value)).toThrow();
    }
  });

  it("rejects localhost, IP literals, and non-443 ports", () => {
    for (const value of [
      "localhost",
      "app.localhost",
      "127.0.0.1",
      "1.1.1.1",
      "[::1]",
      "api.example.com:8443",
    ]) {
      expect(() => validateFederationAuthority(value)).toThrow();
    }
  });
});

describe("federation DNS safety", () => {
  it("blocks private and reserved IPv4 answers", async () => {
    const authority = validateFederationAuthority("api.example.com");
    await expect(
      resolveFederationAuthority(authority, {
        lookup: lookup([{ address: "10.0.0.1", family: 4 }]),
        nodeEnv: "production",
      }),
    ).rejects.toThrow("Blocked");
    expect(isBlockedIpAddress("0.0.0.0")).toBe(true);
    expect(isBlockedIpAddress("100.64.0.1")).toBe(true);
    expect(isBlockedIpAddress("198.18.0.1")).toBe(true);
  });

  it("blocks mixed public and private DNS answers", async () => {
    const authority = validateFederationAuthority("api.example.com");
    await expect(
      resolveFederationAuthority(authority, {
        lookup: lookup([
          { address: "93.184.216.34", family: 4 },
          { address: "192.168.0.10", family: 4 },
        ]),
        nodeEnv: "production",
      }),
    ).rejects.toThrow("Blocked");
  });

  it("checks IPv6 private, documentation, and transition ranges", () => {
    expect(isBlockedIpAddress("::")).toBe(true);
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("fc00::1")).toBe(true);
    expect(isBlockedIpAddress("fe80::1")).toBe(true);
    expect(isBlockedIpAddress("2001:db8::1")).toBe(true);
    expect(isBlockedIpAddress("2001::1")).toBe(true);
    expect(isBlockedIpAddress("2002::1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:8.8.8.8")).toBe(true);
  });

  it("allows private .test DNS only outside production", async () => {
    const authority = validateFederationAuthority("keypears.test");
    await expect(
      resolveFederationAuthority(authority, {
        lookup: lookup([{ address: "127.0.0.1", family: 4 }]),
        nodeEnv: "development",
      }),
    ).resolves.toEqual([{ address: "127.0.0.1", family: 4 }]);

    await expect(
      resolveFederationAuthority(authority, {
        lookup: lookup([{ address: "127.0.0.1", family: 4 }]),
        nodeEnv: "production",
      }),
    ).rejects.toThrow("Blocked");
  });

  it("blocks non-.test private DNS even outside production", async () => {
    const authority = validateFederationAuthority("api.example.com");
    await expect(
      resolveFederationAuthority(authority, {
        lookup: lookup([{ address: "127.0.0.1", family: 4 }]),
        nodeEnv: "development",
      }),
    ).rejects.toThrow("Blocked");
  });
});
