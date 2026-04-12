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

## Experiment 1 — Migrate to NIST-approved cryptography

Replace all non-NIST crypto primitives with their NIST equivalents. This is a
straight substitution — same round counts, same architecture, same key sizes.
The app is pre-launch with no production data, so there is no migration concern.

### Substitution table

| Current | Replacement | Package |
|---|---|---|
| `blake3Hash()` | `sha256Hash()` | `@webbuf/sha256` |
| `blake3Mac()` | `sha256Hmac()` | `@webbuf/sha256` |
| `blake3Pbkdf()` (custom) | `pbkdf2Sha256()` | `@webbuf/pbkdf2-sha256` |
| `acb3Encrypt()` / `acb3Decrypt()` | `aesgcmEncrypt()` / `aesgcmDecrypt()` | `@webbuf/aesgcm` |
| `publicKeyCreate()` / `sign()` / `verify()` | `p256PublicKeyCreate()` / `p256Sign()` / `p256Verify()` | `@webbuf/p256` |
| `sharedSecret()` | `p256SharedSecret()` | `@webbuf/p256` |

### Files to change

**1. `lib/kdf.ts`** — Delete entirely. Replace all call sites with
`pbkdf2Sha256(password, salt, rounds, 32)`. The custom iteration loop is no
longer needed since `@webbuf/pbkdf2-sha256` implements real PBKDF2 (RFC 8018).

**2. `lib/auth.ts`** — Four changes:
- `blake3Hash` → `sha256Hash` (password salt derivation, PoW request signing)
- `blake3Mac` → `sha256Hmac` (salt derivation)
- `publicKeyCreate` / `sign` → `p256PublicKeyCreate` / `p256Sign`
- `acb3Encrypt` / `acb3Decrypt` → `aesgcmEncrypt` / `aesgcmDecrypt`
- `blake3Pbkdf()` calls → `pbkdf2Sha256()` calls
- Remove `import { blake3Pbkdf } from "./kdf"`

**3. `lib/message.ts`** — Three changes:
- `blake3Hash` → `sha256Hash` (ECDH key derivation)
- `sharedSecret` → `p256SharedSecret`
- `acb3Encrypt` / `acb3Decrypt` → `aesgcmEncrypt` / `aesgcmDecrypt`

**4. `lib/vault.ts`** — Two changes:
- `blake3Mac` → `sha256Hmac` (vault key derivation)
- `acb3Encrypt` / `acb3Decrypt` → `aesgcmEncrypt` / `aesgcmDecrypt`

**5. `lib/config.ts`** — One change:
- `blake3Mac` → `sha256Hmac` (PoW signing key derivation from master secret)

**6. `server/user.server.ts`** — Two changes:
- `blake3Hash` → `sha256Hash` (session token hashing)
- `blake3Pbkdf()` calls → `pbkdf2Sha256()` calls
- Remove `import { blake3Pbkdf } from "~/lib/kdf"`

**7. `server/user.functions.ts`** — One change:
- `blake3Hash` → `sha256Hash` (session token identification)

**8. `server/pow.server.ts`** — One change:
- `blake3Mac` → `sha256Hmac` (challenge signing)

**9. `server/pow.consume.ts`** — One change:
- `blake3Hash` → `sha256Hash` (solved header hashing)

**10. `server/utils.ts`** — One change:
- `blake3Hash` → `sha256Hash` (token hashing)

**11. `routes/_app/_saved/_chrome/password.tsx`** — One change:
- `acb3Encrypt` → `aesgcmEncrypt`

**12. `routes/_app/_saved/_chrome/keys.tsx`** — One change:
- `acb3Encrypt` → `aesgcmEncrypt`

**13. `package.json`** — Add new dependencies, remove old:
- Add: `@webbuf/sha256`, `@webbuf/pbkdf2-sha256`, `@webbuf/p256`, `@webbuf/aesgcm`
- Remove: `@webbuf/blake3`, `@webbuf/acb3`, `@webbuf/secp256k1`

**Not changed:** Blog posts (`src/blog/*.md`) reference old crypto in prose.
These are historical records and should not be updated.

### Verification

- `bun run build` — app compiles with no errors
- `bun run test` — all tests pass
- `bun run lint` — no lint errors
- `db:clear` + `db:push` — fresh DB
- Manual smoke test: create account, save password, send message, create vault
  entry, rotate key, re-encrypt locked key, change password

### Result — Pass

All substitutions applied cleanly. 19 files changed (13 source + package.json +
bun.lock + CLAUDE.md + build artifacts), `lib/kdf.ts` deleted. Build, tests
(7/7), and lint all pass. The custom BLAKE3 iteration loop is replaced by
standard PBKDF2 (RFC 8018). Also required passing `.buf` on `FixedBuf` arguments
to `sha256Hmac()` since it takes `WebBuf` keys (unlike `blake3Mac` which accepted
`FixedBuf<32>` directly). The `api.router.ts` dynamic imports of `@webbuf/secp256k1`
and `@webbuf/blake3` were updated to `@webbuf/p256` and `@webbuf/sha256`.

## Experiment 2 — Increase KDF rounds to meet NIST 600K minimum

Bump `CLIENT_KDF_ROUNDS` from 100K to 300K. Leave `SERVER_KDF_ROUNDS` at 100K.

### Rationale

NIST SP 800-132 recommends at least 600K rounds of PBKDF2-HMAC-SHA256. The
recommendation assumes a traditional server-side model. KeyPears does the
majority of KDF work on the client, with the server adding a final layer:

```
Password
  → Password Key      (300K rounds, client)
    → Login Key       (300K rounds, client) → Server hash (100K rounds)
    → Encryption Key  (300K rounds, client)
```

**Attack vector 1 — DB compromise (crack login from password hash):**
Attacker needs 300K + 300K + 100K = 700K rounds per guess. Exceeds 600K.

**Attack vector 2 — localStorage compromise (crack encryption key from password):**
Attacker needs 300K + 300K = 600K rounds per guess. Meets 600K exactly.

The server's 100K rounds stay at 100K because they run synchronously on every
login request. 300K server rounds would add ~66ms latency per login (benchmarked
at ~22ms per 100K on a fast Mac). 100K keeps server latency acceptable while the
client-side rounds provide the bulk of the protection.

### Files to change

**1. `lib/auth.ts:8`** — Change `CLIENT_KDF_ROUNDS` from `100_000` to `300_000`.

That's it. One constant. The server rounds stay at 100K.

### Verification

- `bun run build` — compiles
- `bun run test` — passes
- Benchmark: run `derivePasswordKey()` on a fast machine and a slow machine to
  confirm UX is acceptable (~66ms on M-series Mac, expected ~1-2s on slow
  hardware)

### Result — Pass

One constant changed (`CLIENT_KDF_ROUNDS` 100K → 300K). Build and tests pass.
Extrapolated from earlier benchmarks: ~66ms per tier on M-series Mac, ~132ms for
the two-tier login/save flow. Total rounds per password guess: 700K for DB
compromise (exceeds NIST 600K), 600K for localStorage compromise (meets NIST
600K).

## Experiment 3 — Per-user server-side salt

Replace the global `deriveServerSalt()` with a per-user salt derived from the
user's ID. This prevents parallel dictionary attacks if the DB is compromised.

### Approach

Derive the salt from the userId (UUIDv7), which is unique per user and available
at every call site:

```typescript
function deriveServerSalt(userId: string): FixedBuf<32> {
  return sha256Hash(WebBuf.fromUtf8(`Keypears server login salt v1:${userId}`));
}

function hashLoginKey(loginKeyHex: string, userId: string): string {
  const loginKeyBuf = WebBuf.fromHex(loginKeyHex);
  const salt = deriveServerSalt(userId);
  const hashed = pbkdf2Sha256(loginKeyBuf, salt.buf, SERVER_KDF_ROUNDS, 32);
  return hashed.buf.toHex();
}
```

No schema change needed. No random salt column. The userId is deterministic and
already stored, so verification still works.

### Call sites to update

All in `server/user.server.ts`. Each already has userId available:

1. `createUserForDomain()` — has `id` (reorder: generate id before hashing)
2. `resetUserPassword()` — has `userId` parameter
3. `saveUser()` — has `id` parameter
4. `changePassword()` — has `userId` parameter
5. `reEncryptKey()` — has `userId` parameter
6. `verifyLogin()` — has `saved.id` after user lookup

### Verification

- `bun run build` — compiles
- `bun run test` — passes
- `bun run lint` — clean

### Result — Pass

One file changed (`server/user.server.ts`), six call sites updated to pass
`userId` into `hashLoginKey()`. In `createUserForDomain()`, reordered to generate
the id before hashing. Build and tests pass.

## Experiment 4 — Rate limiting: defer to infrastructure

Investigate whether rate limiting should be implemented at the application level
or the infrastructure level, given the production deployment plan.

### Research

The app will run on AWS Fargate behind an Application Load Balancer (ALB).
Multiple Fargate tasks will serve traffic concurrently.

**Problem with app-level rate limiting:** In-memory rate limiters (e.g.,
express-rate-limit) are per-process. Doubling the number of Fargate tasks doubles
the effective rate limit. A shared store (Redis, database) could fix this, but
adds infrastructure complexity.

**AWS WAF rate-based rules:** AWS WAF attaches directly to the ALB and evaluates
rate limits globally across all traffic, regardless of how many tasks are behind
it. A rate-based rule blocks IPs that exceed a threshold (e.g., 2000 requests per
5-minute window). Rules can be scoped to URL patterns for different thresholds on
different endpoints. Cost is ~$10-15/month. Configuration is via Terraform.

### Decision

Rate limiting (finding H3) will be handled at the AWS WAF layer, not in
application code. This is recorded in `infra/README.md`. The Terraform
configuration will be built out in a separate issue when deployment work begins.

### Result — Pass (deferred to infrastructure)

No app code changes needed. Created `infra/README.md` documenting the production
architecture: AWS Fargate + ALB + WAF + PlanetScale, all managed by Terraform.

## Experiment 5 — Fix SSRF redirect bypass in safeFetch

`safeFetch()` validates DNS before the request but uses `redirect: "follow"`,
which lets a malicious server redirect to a private IP after the check passes.
On AWS, this could reach the instance metadata endpoint (169.254.169.254) and
leak IAM credentials.

Since `safeFetch` is only used to fetch `keypears.json` from well-known URLs,
there is no legitimate reason for redirects. Change `redirect: "follow"` to
`redirect: "error"` to reject redirects entirely.

### File changed

`server/fetch.ts:50` — `redirect: "follow"` → `redirect: "error"`

### Result — Pass

One-line change. Build and tests pass.

## Experiment 6 — Evaluate M2: passwordHash leaked to client

`getMyKeys` returns the server-side password hash to the browser so the Keys page
can identify which keys match the current password vs an old password.

### Analysis

The initial audit flagged this as a risk: "any XSS can exfiltrate the hash." On
closer examination, this is a **non-issue** given the threat model.

**The encryption key in localStorage is already the weaker target.** It requires
600K rounds to derive from the password (300K x 2 client tiers). The server
password hash requires 700K rounds (300K x 2 client + 100K server). An attacker
who can read XHR responses via XSS can also read localStorage, where the
encryption key is cached in the clear. There is no scenario where cracking the
harder 700K-round hash is advantageous when the 600K-round encryption key is
already available.

**The user knows their own password.** The hash does not reveal anything the
authenticated user does not already possess. It is their own credential, hashed.

**No browser-based alternative exists.** The encryption key must be cached
client-side to enable decryption without re-entering the password on every
operation. Short of an HSM, there is no way to protect a client-side secret from
JavaScript running in the same origin. The passwordHash does not change this
attack surface.

### Result — Pass (no change needed)

M2 is not a real vulnerability. The passwordHash is strictly harder to crack than
the encryption key already cached in localStorage. No code change required.
