+++
status = "closed"
opened = "2026-04-09"
closed = "2026-04-09"
+++

# Issue 9: Protocol Security Fixes

## Goal

Fix security vulnerabilities found in the pre-launch audit of the federated
protocol, API, and authentication system.

## Background

A security audit of the federation protocol identified 2 critical and 3 medium
issues that need fixing before launch.

### Critical

**1. `pullMessage` race condition (TOCTOU).**

In `api.router.ts`, the `pullMessage` endpoint does a SELECT then a DELETE. Two
concurrent requests with the same token could both succeed — both read the
delivery, both return the message data, only one delete succeeds. This allows
message duplication.

Fix: use a transaction with `FOR UPDATE` lock so the first request locks the row
and the second blocks until the first completes and deletes it.

**2. SSRF in domain verification.**

`verifyDomainAdmin` in `user.server.ts` fetches
`https://{domainName}/.well-known/keypears.json` where `domainName` comes from
user input. An attacker could pass `localhost`, `127.0.0.1`, `192.168.x.x`, or
other private IPs to probe internal services.

Similarly, `resolveApiUrl` in `federation.server.ts` fetches from
user-controlled domains.

Fix: blocklist private/reserved IP ranges before fetching. Add a timeout (5
seconds). Limit response size.

### Medium

**3. PoW input validation order.**

In `pow.server.ts`, `verifyPowSolution` calls `WebBuf.fromHex()` on the solved
header before checking its length. A very large hex string could exhaust memory
before the length check rejects it.

Fix: validate hex string length before parsing.

**4. API domain cache has no TTL.**

In `federation.server.ts`, `resolveApiUrl` caches the `apiDomain` from
`keypears.json` forever. If DNS was compromised during that one fetch, the wrong
API domain is trusted permanently.

Fix: add a TTL (e.g. 1 hour) to the cache. Stale entries are re-fetched.

**5. Error messages leak domain/user existence.**

In `api.router.ts`, different error messages for "domain not found" vs "user not
found" allow enumeration of which domains and users exist.

Fix: return a generic error for all lookup failures.

### Not issues (audit false positives)

- Channel authorization: `resolveChannel` already checks ownership via
  `getChannelByCounterparty(userId, ...)`. Not vulnerable.
- Token hashing: both functions hash hex-as-UTF8 consistently. Not a bug.
- Rate limiting: PoW is the rate limiter by design.
- apiDomain validation: domains can point to any server. That's federation.
- CORS: oRPC endpoints are server-to-server. Clients don't call them.

## Experiments

### Experiment 1: Fix all protocol security issues

#### Description

Fix all 5 findings in a single experiment. Each fix is small and
independent.

#### Changes

**1. Fix `pullMessage` race condition (`webapp/src/server/api.router.ts`):**

Wrap the SELECT + DELETE in a transaction with `FOR UPDATE`:

```ts
const delivery = await db.transaction(async (tx) => {
  const [row] = await tx
    .select()
    .from(pendingDeliveries)
    .where(eq(pendingDeliveries.tokenHash, hash))
    .limit(1)
    .for("update");
  if (!row) return null;
  await tx.delete(pendingDeliveries).where(eq(pendingDeliveries.id, row.id));
  return row;
});
if (!delivery) throw new Error("Message not found or already pulled");
```

The `FOR UPDATE` lock ensures the second concurrent request blocks until
the first deletes the row, then finds nothing.

**2. Add SSRF protection (`webapp/src/lib/config.ts`):**

Add a `safeFetch(url)` helper that:
- Resolves the hostname to an IP (via `dns.resolve4`)
- Rejects if the IP is in a private range (127.0.0.0/8, 10.0.0.0/8,
  172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0)
- Sets a 5-second timeout via `AbortSignal.timeout(5000)`
- Limits response body to 1 MB

Use `safeFetch` in:
- `verifyDomainAdmin` (`user.server.ts`)
- `resolveApiUrl` (`federation.server.ts`)

**3. Fix PoW input validation order (`webapp/src/server/pow.server.ts`):**

In `verifyPowSolution`, check hex string lengths before parsing:

```ts
if (solvedHeaderHex.length !== HEADER_SIZE * 2) {
  return { valid: false, message: "Invalid header size" };
}
if (targetHex.length !== 64) {
  return { valid: false, message: "Invalid target size" };
}
if (signatureHex.length !== 64) {
  return { valid: false, message: "Invalid signature size" };
}
```

**4. Add TTL to API domain cache (`webapp/src/server/federation.server.ts`):**

Replace the simple `Map<string, string>` with a
`Map<string, { apiDomain: string; fetchedAt: number }>`. On cache hit,
check if `Date.now() - fetchedAt > 60_000` (1 minute). If expired,
re-fetch.

**5. Generic error messages (`webapp/src/server/api.router.ts`):**

In `getPublicKey` and `notifyMessage`, replace specific errors with a
single generic message:

- "Recipient not found on this server" → "Not found"
- "Recipient not found" → "Not found"
- "Invalid recipient address" → "Not found"

#### Verification

1. `pullMessage` with two concurrent requests using the same token — only
   one succeeds, the other gets "Message not found".
2. `verifyDomainAdmin("127.0.0.1")` — rejected before fetch.
3. `verifyDomainAdmin("localhost")` — rejected before fetch.
4. `verifyPowSolution` with a 10 MB hex string — rejected immediately
   without parsing.
5. Cache a domain's apiDomain. Wait 61 seconds. Next fetch re-resolves.
6. `getPublicKey({ address: "nobody@fake.test" })` — returns
   `{ publicKey: null }`, no error message reveals whether domain or user
   was the issue.
7. All existing functionality works: create account, send messages,
   federation, domain claiming.

**Result:** Pass

#### Conclusion

All five findings fixed. `pullMessage` uses `FOR UPDATE` to prevent race
conditions. `safeFetch` blocks private IPs with DNS resolution, 5s timeout,
and 1MB size limit. PoW validates input lengths before parsing. The
`keypears.json` cache uses a 1-minute TTL and caches the full response
(validated with Zod). Generic error messages prevent user/domain
enumeration. Also consolidated the `keypears.json` fetch into a single
`fetchKeypearsJson` function shared by `resolveApiUrl` and
`verifyDomainAdmin`.

## Conclusion

All protocol security issues identified in the pre-launch audit are fixed.
The `pullMessage` race condition is eliminated via row locking. SSRF is
blocked by `safeFetch` which resolves DNS and rejects private IPs before
making requests. PoW input validation rejects oversized inputs before
allocating memory. The `keypears.json` cache expires after 1 minute and
validates responses with Zod. Error messages are generic to prevent
enumeration.
