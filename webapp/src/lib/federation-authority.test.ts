import { describe, expect, it } from "vitest";
import {
  federationApiUrl,
  federationWellKnownUrl,
  validateFederationAuthority,
} from "./federation-authority";

describe("federation authority validation", () => {
  it("normalizes valid hostnames", () => {
    expect(validateFederationAuthority("API.Example.COM")).toBe(
      "api.example.com",
    );
    expect(validateFederationAuthority("keypears.test")).toBe("keypears.test");
    expect(validateFederationAuthority("xn--bcher-kva.example")).toBe(
      "xn--bcher-kva.example",
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
      "bücher.example",
    ]) {
      expect(() => validateFederationAuthority(value)).toThrow();
    }
  });

  it("rejects localhost, IP literals, and ports", () => {
    for (const value of [
      "localhost",
      "app.localhost",
      "127.0.0.1",
      "1.1.1.1",
      "[::1]",
      "api.example.com:443",
      "api.example.com:8443",
    ]) {
      expect(() => validateFederationAuthority(value)).toThrow();
    }
  });

  it("constructs HTTPS federation URLs from validated authorities", () => {
    const authority = validateFederationAuthority("api.example.com");
    expect(federationApiUrl(authority)).toBe("https://api.example.com/api");
    expect(federationWellKnownUrl(authority)).toBe(
      "https://api.example.com/.well-known/keypears.json",
    );
  });
});
