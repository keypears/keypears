+++
status = "open"
opened = "2026-05-17"
+++

# Issue 39: Federation SSRF Hardening

## Goal

Eliminate SSRF risk from server-side federation requests while preserving the
KeyPears protocol's ability to discover and communicate with remote domains.

## Background

KeyPears federation requires servers to make outbound requests derived from user
addresses and remote `keypears.json` files:

- discover `https://{address-domain}/.well-known/keypears.json`
- read `apiDomain`
- call `https://{apiDomain}/api` through the oRPC client

The current implementation protects the first discovery fetch with
`safeFetch()`, but the protection is incomplete and does not cover the second
hop to the remote API.

Current relevant code:

- `webapp/src/server/federation.server.ts`:
  - `fetchKeypearsJson(domain)` uses `safeFetch()`.
  - `resolveApiUrl(domain)` trusts `json.apiDomain` and returns
    `https://${json.apiDomain}/api`.
  - `getRemoteClient(domain)` creates a normal oRPC client for that API URL.
- `webapp/src/server/api.router.ts`:
  - `getPowChallenge` resolves the sender domain and calls the sender API.
  - `notifyMessage` resolves the sender domain and pulls a pending message from
    the sender API.
- `webapp/src/server/fetch.ts`:
  - blocks some private IPv4 ranges and `localhost`
  - uses `resolve4()`
  - blocks redirects
  - enforces a timeout and response-size limit

## Current SSRF Exposure

The first hop is partially protected, but a hostile public domain can serve a
`keypears.json` like:

```json
{ "apiDomain": "127.0.0.1:1234" }
```

The server then constructs `https://127.0.0.1:1234/api` and hands it to the
normal oRPC fetch path, which does not use `safeFetch()`.

Additional hardening gaps:

- IPv6 loopback, link-local, unique-local, mapped IPv4, and other non-public
  ranges are not comprehensively blocked.
- DNS rebinding remains possible because `safeFetch()` resolves DNS before
  calling `fetch()`, but `fetch()` performs its own connection resolution.
- Only A records are checked; AAAA records are not checked.
- `apiDomain` is validated only as `z.string()`, not as a safe public hostname
  or domain authority.
- Federation requests and domain-claim verification do not share a single
  hardened outbound HTTP path.

## Requirements

- All server-side federation HTTP requests must go through one hardened outbound
  path.
- Discovery requests and remote oRPC API calls must receive the same SSRF
  protections.
- Validate address domains and `apiDomain` values as hostnames or hostname plus
  explicitly allowed port syntax; reject arbitrary URL strings, userinfo, paths,
  query strings, fragments, and malformed authorities.
- Reject localhost, private, loopback, link-local, multicast, documentation,
  unspecified, reserved, and otherwise non-public IP ranges for both IPv4 and
  IPv6.
- Check both A and AAAA records.
- Avoid DNS rebinding by ensuring the actual outbound connection uses the vetted
  IP address or another equivalent pinned-resolution strategy.
- Block redirects unless a later experiment explicitly proves safe redirect
  handling.
- Preserve timeouts and response-size limits for `keypears.json`.
- Preserve the protocol rule that remote domains are discovered via HTTPS and
  TLS.
- Add tests for hostile `keypears.json` values, private IP literals, IPv6
  literals, localhost names, and DNS responses containing blocked addresses.

## Non-Goals

- Do not remove federation.
- Do not add global key transparency or change the server-trust model.
- Do not trust client-side validation for server-side federation safety.
- Do not silently externalize the oRPC calls without SSRF protection.
- Do not broaden allowed schemes beyond HTTPS.

## Experiment 1: Pinned-resolution federation fetch

### Hypothesis

SSRF can be eliminated from the current federation implementation by replacing
all server-side federation network calls with one pinned-resolution HTTPS fetch
primitive, then wiring both discovery and oRPC federation clients through it.

The critical property is that DNS is resolved once, validated, and the actual
TLS connection is opened to the vetted IP address while preserving the original
hostname for TLS SNI, certificate validation, and the HTTP `Host` header. This
closes the DNS rebinding gap left by resolving before a normal `fetch()`.

### Plan

1. Replace `safeFetch()` with a stricter server-only federation fetch module.
   - Accept only `https://` URLs.
   - Reject URLs with userinfo.
   - Reject redirects.
   - Preserve the existing timeout behavior.
   - Accept a per-call response-size cap instead of hard-coding one global cap.
     `keypears.json` can stay small; oRPC responses should use limits that fit
     their schema-bound payload sizes.

2. Add strict authority validation.
   - Introduce a validated authority type, e.g. `FederationAuthority`, so raw
     strings cannot flow into federation URL construction by accident.
   - Accept DNS hostnames only.
   - Reject all IP literals by default, even public ones. KeyPears federation is
     domain-based and depends on DNS + TLS hostnames.
   - Allow only the default HTTPS port, 443. Do not allow arbitrary ports for
     production federation.
   - Reject paths, query strings, fragments, and full URL strings anywhere a
     domain or `apiDomain` value is expected.
   - Reject `localhost` and localhost-like names.
   - Replace or constrain `apiUrlFromDomain()` so it accepts only a validated
     authority type, or make the raw string helper private to the validator
     module.
   - Validate this server's own `KEYPEARS_API_DOMAIN` through the same authority
     validator at config access/startup so bad self-configuration fails early.
   - Normalize validated hostnames to lowercase ASCII form and use that
     normalized form for cache keys.

3. Preserve local development explicitly, not implicitly.
   - Local federation currently runs through Caddy on loopback for domains like
     `keypears.test` and `keypears.passapples.test`.
   - When `NODE_ENV !== "production"`, allow `.test` federation hostnames to
     resolve to private or loopback addresses so the existing dev topology keeps
     working with no env changes.
   - This `.test` allowance must be disabled when `NODE_ENV === "production"`.
   - Do not add a broad private-network escape hatch.
   - Add tests proving `.test` private DNS answers are allowed in dev mode,
     blocked in production mode, and that non-`.test` private DNS answers remain
     blocked in dev mode.

4. Add public-address classification for IPv4 and IPv6.
   - Block loopback, private, link-local, multicast, unspecified, documentation,
     reserved, carrier-grade NAT, benchmarking, and IPv4-mapped IPv6 addresses
     that resolve to blocked IPv4 ranges.
   - Also block IPv6 transition/tunnel ranges such as 6to4 (`2002::/16`) and
     Teredo (`2001::/32`).
   - Check both A and AAAA records.
   - Reject a hostname if any usable DNS answer is non-public, not only if all
     answers are non-public. Mixed public/private answers are unsafe.
   - Add an explicit test for `0.0.0.0`.

5. Implement pinned-resolution HTTPS fetch.
   - Use Node's Undici dispatcher/agent hooks or equivalent low-level HTTPS
     connector.
   - Resolve the original hostname with the hardened resolver.
   - Select one vetted IP address.
   - Connect to that IP address.
   - Send the original hostname as TLS `servername`.
   - Ensure TLS certificate validation is performed for the original hostname,
     not the IP address.
   - Send the original hostname in the HTTP `Host` header.
   - Do not follow redirects.

6. Wire discovery and domain-claim verification through the pinned fetch.
   - `fetchKeypearsJson(domain)` validates `domain`.
   - It fetches `https://{domain}/.well-known/keypears.json` through the pinned
     fetch.
   - It validates `apiDomain` with the same authority validator.
   - `verifyDomainAdmin()` remains covered because it calls `fetchKeypearsJson`;
     add tests for the domain-claim path so this does not regress.

7. Wire remote oRPC federation calls through the pinned fetch.
   - First verify the exact `@orpc/client/fetch` `RPCLink` API for custom fetch
     support.
   - If `RPCLink` accepts a `fetch` option, create a server-only federation
     client factory that passes the pinned fetch into `RPCLink`.
   - Confirm the custom fetch path controls redirects, timeout, headers, and
     request body behavior as expected.
   - If `RPCLink` cannot be safely wired to a custom fetch, build a small
     server-only federation client wrapper that sends the oRPC calls through the
     pinned fetch directly.
   - Ensure `getRemoteClient(domain)` uses the pinned fetch for all remote API
     calls.
   - Ensure inbound federation handlers in `api.router.ts` that call remote
     sender APIs also go through this path.

8. Update documentation.
   - Update `webapp/src/docs/security.md` so its SSRF/federation section
     describes pinned-resolution federation fetch, not the old preflight
     `safeFetch()` behavior.

9. Add focused tests.
   - Hostname validation rejects full URLs, userinfo, paths, query strings,
     fragments, malformed authorities, and localhost names.
   - `apiDomain` rejects private IPv4 literals, IPv6 literals for private
     ranges, and blocked DNS answers.
   - `apiDomain` rejects non-443 ports.
   - DNS resolution checks A and AAAA records.
   - Mixed public/private DNS answers are rejected.
   - `0.0.0.0` is rejected.
   - Redirect responses are rejected.
   - `.test` private DNS answers are allowed only in dev mode and are blocked in
     production.
   - Non-`.test` private DNS answers are blocked even in dev mode.
   - Discovery and oRPC calls both use the hardened fetch path.

### Verification

- `pnpm --filter @keypears/webapp typecheck`
- `pnpm --filter @keypears/webapp test`
- Add targeted unit tests for the federation fetch module.
- Add a targeted integration-style test or mock that proves oRPC federation
  calls use the custom pinned fetch instead of global `fetch`.
- `rg -n "fetch\\(|createKeypearsClientFromUrl|RPCLink|new RPCLink"` confirms
  no server-side federation call bypasses the hardened path.
- Confirm `webapp/src/docs/security.md` was updated.

### Success Criteria

- Server-side federation discovery cannot fetch private or reserved network
  targets.
- Server-side remote API calls cannot fetch private or reserved network targets.
- DNS rebinding is addressed by pinned connection behavior, not by a best-effort
  preflight check.
- Existing federation behavior still works for normal public HTTPS domains.

### Result

Pass.

Implemented a server-only pinned-resolution federation fetch path. Federation
authorities now validate as normalized DNS hostnames, reject full URLs,
userinfo, IP literals, localhost names, non-443 ports, paths, queries, and
fragments. The server's own `KEYPEARS_API_DOMAIN` is validated through the same
authority validator.

Discovery now fetches `keypears.json` through the hardened path with a small
response limit, validates the returned `apiDomain`, and keys the discovery
cache by normalized authority. Domain-claim verification remains covered by the
same discovery function.

Remote oRPC federation clients now use `RPCLink` with the pinned fetch injected
as the custom fetch implementation. The two inbound federation handlers that
look up sender keys and pull messages now use the same `getRemoteClient()`
factory instead of constructing a plain client.

The pinned fetch resolves DNS once, rejects any non-public DNS answer by
default, connects to the selected vetted IP address, preserves the original
hostname for TLS SNI/certificate validation and the `Host` header, rejects
redirects, enforces a 5-second timeout, and accepts per-call response-size
limits. Dev federation still works without env changes because `.test`
authorities may resolve to private or loopback addresses only when
`NODE_ENV !== "production"`.

Added focused tests for authority validation, blocked IPv4 and IPv6 ranges,
mixed public/private DNS answers, `0.0.0.0`, and the dev-only `.test` allowance.
Updated `webapp/src/docs/security.md` to describe the new behavior.

Verification:

- `pnpm --filter @keypears/webapp typecheck`
- `pnpm --filter @keypears/webapp test`
- `pnpm --filter @keypears/webapp lint` (existing warnings only)
- `pnpm --filter @keypears/webapp build` (existing CSS/chunk warnings only)
- `rg -n "fetch\\(|createKeypearsClientFromUrl|RPCLink|new RPCLink" webapp/src packages/client/src`

## Experiment 2: Simplify federation fetch policy

### Hypothesis

The current pinned-resolution fetch is more complex than the project needs.
KeyPears can keep the important protocol guardrails with a much simpler rule:
server-side federation URLs must use HTTPS and must target a real DNS hostname.
No IP literals, no `localhost`, no userinfo, no paths inside authority values,
and no non-443 ports.

There should be no special `.test` handling and no environment check in the
federation fetch policy. Local `.test` domains work in development if the local
resolver/Caddy setup resolves them, and they naturally do not work in
production unless production DNS is explicitly configured to resolve them.

### Plan

1. Keep the `FederationAuthority` validator.
   - Continue accepting normalized DNS hostnames.
   - Continue rejecting full URLs, userinfo, paths, queries, fragments,
     localhost names, IP literals, and non-443 ports.
   - Keep `KEYPEARS_API_DOMAIN` validation through the same validator.

2. Remove DNS/IP classification from the fetch path.
   - Delete private/reserved IP blocklists.
   - Delete A/AAAA answer inspection.
   - Delete the dev-only `.test` carve-out.
   - Delete `nodeEnv` plumbing from `SafeFederationFetchOptions`.

3. Simplify `safeFederationFetch()`.
   - Validate that the request URL is HTTPS.
   - Validate `url.host` as a `FederationAuthority`.
   - Use normal `fetch()` with `redirect: "error"` and a timeout.
   - Preserve the per-call response-size cap by reading the response body and
     rebuilding a `Response`.
   - Keep the oRPC custom fetch injection so discovery and remote API calls
     still share the same federation fetch wrapper.

4. Simplify tests.
   - Keep tests for authority validation.
   - Keep tests proving HTTPS-only behavior, redirect rejection, response-size
     limits, and rejection of localhost/IP literal/non-443 authorities.
   - Remove tests for private DNS answers, mixed DNS answers, IPv6 transition
     ranges, and `.test` environment behavior.
   - Add a test documenting that `.test` receives no special policy decision:
     `keypears.test` is just a valid DNS hostname.

5. Update documentation.
   - Revise `webapp/src/docs/security.md` to describe the simpler policy:
     federation requires HTTPS and valid DNS hostnames, rejects localhost/IP
     literal authorities, rejects redirects, times out, and caps response
     bodies.
   - Remove claims about pinned DNS resolution, private-address blocklists, and
     environment-specific `.test` behavior.

### Verification

- `pnpm --filter @keypears/webapp typecheck`
- `pnpm --filter @keypears/webapp test`
- `pnpm --filter @keypears/webapp build`
- `rg -n "nodeEnv|isDevTestAuthority|isBlockedIpAddress|resolveFederationAuthority|dnsLookup|httpsRequest" webapp/src/server webapp/src/lib`
  confirms the removed complexity is gone.
- `rg -n "createKeypearsClientFromUrl|RPCLink|new RPCLink" webapp/src`
  confirms server-side federation still uses the custom fetch path.

### Success Criteria

- Federation fetch code is small and easy to reason about.
- There is no environment-specific `.test` branch.
- Federation still rejects unsafe authority shapes: non-HTTPS URLs, IP
  literals, localhost, userinfo, paths, query strings, fragments, and non-443
  ports.
- Discovery and remote oRPC calls still share the same safe federation fetch
  wrapper.

### Result

Pass.

Simplified the federation fetch path to match the project policy. The wrapper
now validates HTTPS and validates the request host as a `FederationAuthority`,
then uses normal `fetch()` with redirect rejection, a timeout, and a per-call
response-size cap.

Removed the pinned DNS resolver, private/reserved IP classification,
environment-specific `.test` handling, and low-level `https.request` connector.
`.test` now receives no special policy treatment: it is just a valid DNS
hostname, and it works only if the runtime resolver can resolve it.

Kept the shared oRPC custom fetch path so discovery, domain-claim verification,
and remote federation API calls still go through the same wrapper. Updated
tests and security docs to describe the simpler behavior.

Verification:

- `pnpm --filter @keypears/webapp typecheck`
- `pnpm --filter @keypears/webapp test`
- `pnpm --filter @keypears/webapp lint` (existing warnings only)
- `pnpm --filter @keypears/webapp build` (existing CSS/chunk warnings only)
- `rg -n "nodeEnv|isDevTestAuthority|isBlockedIpAddress|resolveFederationAuthority|dnsLookup|httpsRequest" webapp/src/server webapp/src/lib`
- `rg -n "createKeypearsClientFromUrl|RPCLink|new RPCLink" webapp/src`
