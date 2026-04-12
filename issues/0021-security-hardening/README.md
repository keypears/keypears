+++
status = "open"
opened = "2026-04-11"
+++

# Security hardening

## Goal

Address the findings from a full security audit of the webapp. The audit found
no critical vulnerabilities in the E2E encryption model, but identified gaps in
KDF strength, rate limiting, SSRF protection, information leakage, and missing
browser security headers that need to be closed before production launch.

## Background

A comprehensive audit examined all crypto, auth, server functions, federation,
PoW, and client-side code. The E2E encryption is sound: private keys never leave
the browser unencrypted, ACB3 uses random IVs, and ECDH shared secrets are
computed client-side. Auth gates and IDOR protections are correct.

The issues fall into two categories:

**User-facing ("can anybody steal my secrets?"):** The main risk is XSS. If an
attacker executes JavaScript in the browser, they can read the cached encryption
key from localStorage and decrypt private keys. CSP headers and an encryption
key timeout would shrink this window significantly.

**Operator-facing ("can anybody break in or DOS me?"):** No endpoint has rate
limiting. Unauthenticated endpoints can be hammered at zero cost. `safeFetch`
follows redirects after the SSRF check, allowing private-IP redirects. DB tables
with lazy cleanup (`used_pow`, `pending_deliveries`) can grow unbounded.

## Findings

### High severity

**H1. KDF round count is below NIST recommendation.**

100K rounds of BLAKE3 keyed MAC per tier. Benchmarking shows BLAKE3 and
HMAC-SHA256 are effectively the same speed for 32-byte inputs (~22ms per 100K
rounds), so this is equivalent to 100K PBKDF2-SHA256 rounds. NIST's 2023
recommendation is 600K. The three-tier derivation helps (200K client rounds for
encryption key, 300K total for login), but total rounds are still below the
recommended minimum.

Files: `lib/kdf.ts`, `lib/auth.ts:8`, `server/user.server.ts:13`.

**H2. Global server-side salt for password hashing.**

`deriveServerSalt()` returns the same deterministic value for all users. If the
DB is compromised, an attacker can crack all password hashes in parallel with a
single dictionary pass. The client-side salt IS per-user (derived from the
password at `auth.ts:66-68`), which mitigates somewhat, but the server tier
should also use per-user salt.

Files: `server/user.server.ts:155-157`.

**H3. No rate limiting on any endpoint.**

No endpoint has rate limiting. While PoW gates registration/login/messaging,
other endpoints are ungated:

- `checkNameAvailable()` — username enumeration at scale.
- `getProfile()` — user enumeration.
- `getPublicKeyForAddress()` — key harvesting.
- PoW challenge generation — free to call.
- Federation endpoints (`notifyMessage`, `getPowChallenge`) — remote flood.

### Medium severity

**M1. SSRF bypass via redirect.**

`safeFetch()` validates DNS before the request, but `redirect: "follow"` means a
malicious server can redirect to a private IP after the initial check passes.

File: `server/fetch.ts:48-51`.

**M2. `passwordHash` leaked to client.**

`getMyKeys` returns the full server-side password hash to the browser. Used on
the Keys page to identify which keys match the current password. Any XSS can
exfiltrate it.

File: `server/user.functions.ts:263`.

**M3. No Content Security Policy or security headers.**

Missing: `Content-Security-Policy`, `X-Frame-Options`,
`Strict-Transport-Security`, `X-Content-Type-Options`. No browser-level defense
against XSS or clickjacking.

**M4. Encryption key cached indefinitely in localStorage.**

The encryption key sits in localStorage forever until explicit logout. No idle
timeout, no cross-tab logout sync.

File: `lib/auth.ts:136-148`.

**M5. `pending_deliveries` and `used_pow` table growth.**

Both tables use lazy cleanup. Neither has a size cap. An attacker can fill them
by sending many remote messages or submitting many PoW solutions.

Files: `server/federation.server.ts:162`, `server/pow.consume.ts:59`.

**M6. User enumeration timing leak on login.**

When a user doesn't exist, the response is fast (no KDF). When the user exists
but password is wrong, `hashLoginKey()` adds measurable delay (100K rounds).

File: `server/user.server.ts:359-381`.

### Low severity

**L1.** `checkNameAvailable()` is unauthenticated — username enumeration.

**L2.** Cookie `secure` flag disabled in development (`user.functions.ts:54`).

**L3.** `getRemotePowChallenge` is unauthenticated but triggers outbound HTTP,
modest amplification vector.

**L4.** `BigInt()` constructor without Zod validation
(`user.functions.ts:523-524`).
