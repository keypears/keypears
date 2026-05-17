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
   - Preserve the response-size limit for `keypears.json` fetches.

2. Add strict authority validation.
   - Accept hostnames plus optional port.
   - Reject paths, query strings, fragments, and full URL strings anywhere a
     domain or `apiDomain` value is expected.
   - Reject `localhost` and localhost-like names.
   - Decide in code whether public IP literals are allowed. The conservative
     default is to reject all IP literals for federation domain fields and allow
     only DNS hostnames.

3. Add public-address classification for IPv4 and IPv6.
   - Block loopback, private, link-local, multicast, unspecified, documentation,
     reserved, carrier-grade NAT, benchmarking, and IPv4-mapped IPv6 addresses
     that resolve to blocked IPv4 ranges.
   - Check both A and AAAA records.
   - Reject a hostname if any usable DNS answer is non-public, not only if all
     answers are non-public. Mixed public/private answers are unsafe.

4. Implement pinned-resolution HTTPS fetch.
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

5. Wire discovery through the pinned fetch.
   - `fetchKeypearsJson(domain)` validates `domain`.
   - It fetches `https://{domain}/.well-known/keypears.json` through the pinned
     fetch.
   - It validates `apiDomain` with the same authority validator.

6. Wire remote oRPC federation calls through the pinned fetch.
   - Update `createKeypearsClientFromUrl` or add a server-only federation client
     factory that accepts a custom fetch implementation.
   - Ensure `getRemoteClient(domain)` uses the pinned fetch for all remote API
     calls.
   - Ensure inbound federation handlers in `api.router.ts` that call remote
     sender APIs also go through this path.

7. Add focused tests.
   - Hostname validation rejects full URLs, userinfo, paths, query strings,
     fragments, malformed authorities, and localhost names.
   - `apiDomain` rejects private IPv4 literals, IPv6 literals for private
     ranges, and blocked DNS answers.
   - DNS resolution checks A and AAAA records.
   - Mixed public/private DNS answers are rejected.
   - Redirect responses are rejected.
   - Discovery and oRPC calls both use the hardened fetch path.

### Verification

- `pnpm --filter @keypears/webapp typecheck`
- `pnpm --filter @keypears/webapp test`
- Add targeted unit tests for the federation fetch module.
- Add a targeted integration-style test or mock that proves oRPC federation
  calls use the custom pinned fetch instead of global `fetch`.
- `rg -n "fetch\\(|createKeypearsClientFromUrl|RPCLink"` confirms no server-side
  federation call bypasses the hardened path.

### Success Criteria

- Server-side federation discovery cannot fetch private or reserved network
  targets.
- Server-side remote API calls cannot fetch private or reserved network targets.
- DNS rebinding is addressed by pinned connection behavior, not by a best-effort
  preflight check.
- Existing federation behavior still works for normal public HTTPS domains.
