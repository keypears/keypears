import { describe, expect, it } from "vitest";
import { validateFederationAuthority } from "~/lib/federation-authority";
import { safeFederationFetch } from "./fetch";

describe("federation authority validation", () => {
  it("normalizes valid hostnames", () => {
    expect(validateFederationAuthority("API.Example.COM")).toBe(
      "api.example.com",
    );
    expect(validateFederationAuthority("api.example.com:443")).toBe(
      "api.example.com",
    );
    expect(validateFederationAuthority("keypears.test")).toBe("keypears.test");
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

describe("safeFederationFetch", () => {
  it("requires HTTPS", async () => {
    await expect(safeFederationFetch("http://api.example.com/api")).rejects.toThrow(
      "HTTPS",
    );
  });

  it("rejects invalid authorities before fetching", async () => {
    let called = false;
    await expect(
      safeFederationFetch("https://127.0.0.1/api", undefined, {
        fetch: async () => {
          called = true;
          return new Response("{}");
        },
      }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });

  it("uses redirect error mode and a timeout", async () => {
    let redirect: RequestRedirect | undefined;
    let signal: AbortSignal | null | undefined;
    await safeFederationFetch("https://api.example.com/api", undefined, {
      fetch: async (_request, init) => {
        redirect = init?.redirect;
        signal = init?.signal;
        return new Response("ok");
      },
    });

    expect(redirect).toBe("error");
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("limits response size", async () => {
    await expect(
      safeFederationFetch("https://api.example.com/api", undefined, {
        maxResponseBytes: 2,
        fetch: async () => new Response("too large"),
      }),
    ).rejects.toThrow("too large");
  });
});
