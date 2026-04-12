+++
status = "open"
opened = "2026-04-12"
+++

# Web Crypto API migration for NIST primitives

## Goal

Evaluate whether the browser's Web Crypto API (`crypto.subtle`) and Bun's
equivalent server-side implementation can replace any of our WASM-backed
`@webbuf/*` crypto calls, and migrate the ones where native is meaningfully
faster.

## Background

The recent NIST migration (issue 0021) replaced every non-standard primitive in
KeyPears with a NIST-approved equivalent: SHA-256, HMAC-SHA-256,
PBKDF2-HMAC-SHA-256, AES-256-GCM, and P-256 ECDH/ECDSA. Every single one of
these has a native implementation in `crypto.subtle`, both in browsers and in
Bun — which wasn't true for BLAKE3, secp256k1, or ACB3 before the migration. The
NIST switch unlocked the native path as a side benefit we didn't explicitly
design for.

The question now is whether the native path is fast enough, and free enough of
downsides, to be worth using. Native implementations typically have several
advantages:

- **Hardware acceleration.** Modern x86 CPUs have SHA-NI instructions that
  compute a SHA-256 compression round in approximately one cycle. ARM has
  equivalent SHA-2 extensions. AES-NI provides the same for AES. WASM cannot
  access these instructions directly — at best it uses software SIMD.
- **No WASM interop overhead.** For large iterative work (PBKDF2), this is less
  important because the whole loop is one call either way. For many-small-hashes
  workloads it matters more.
- **Battle-tested implementations.** Browser crypto is typically OpenSSL,
  BoringSSL, or NSS — some of the most reviewed code on the planet.
- **Main-thread behavior.** Most `crypto.subtle` methods return promises and run
  off the main thread in modern browsers, which means a long PBKDF2 run on login
  no longer freezes the UI. Our current WASM implementation runs synchronously
  on the main thread inside the PBKDF2 loop, blocking paint and input handling
  for tens to hundreds of milliseconds.

The biggest expected win is PBKDF2: 300K client-side rounds per tier plus 600K
server-side rounds, every login and account save. If the native implementation
is 5-10x faster (a plausible range given SHA-NI), we get noticeably snappier
logins and substantially cheaper server operation, for zero cryptographic
downside.

## Approach

This is a three-phase investigation:

1. **Survey.** Identify which of our current webbuf primitives have
   `crypto.subtle` equivalents in the browser, and which have equivalents in
   Bun's server-side `crypto.subtle`. Note the API shape differences
   (async/promise-based, different type expectations, different serialization
   formats) so we know the migration cost per primitive.

2. **Benchmark.** Write a head-to-head benchmark for each primitive:
   - PBKDF2-HMAC-SHA-256 at 300K rounds (client KDF tier)
   - PBKDF2-HMAC-SHA-256 at 600K rounds (server KDF tier)
   - SHA-256 on a 32-byte input (hot path for message key derivation)
   - HMAC-SHA-256 on a 32-byte input (vault key derivation, PoW signing)
   - AES-256-GCM on a 1KB input (typical message ciphertext size)
   - P-256 ECDH shared secret derivation
   - P-256 ECDSA sign and verify

   Run each benchmark in the browser (WASM webbuf vs `window.crypto.subtle`) and
   in Bun (WASM webbuf vs `Bun.crypto.subtle` or `node:crypto`). Record
   wall-clock time per operation.

   Also measure main-thread blocking: run a benchmark while animating a
   `requestAnimationFrame` loop and observe frame drops. The WASM path should
   drop frames during long PBKDF2 runs; the Web Crypto path should not.

3. **Migrate.** For each primitive where Web Crypto is meaningfully faster (and
   for PBKDF2, regardless of speed, to unblock the main thread), reimplement the
   KeyPears call site to use `crypto.subtle`. Keep the type-level API of
   `auth.ts`, `message.ts`, `vault.ts`, etc. identical so the rest of the app
   doesn't notice — only the bottom layer changes.

## Expected complications

- **Async everywhere.** Web Crypto is promise-based. Our current synchronous
  `derivePasswordKey()` etc. would become async. Every caller needs to be
  checked — most are already inside async handlers but some may not be.

- **Key object model.** Web Crypto uses opaque `CryptoKey` objects rather than
  raw `Uint8Array`/`FixedBuf` byte arrays. For PBKDF2 we have to import the
  password as a key first (`importKey` with `"raw"`) before calling
  `deriveBits`. This adds a small per-call overhead that may matter for short
  operations but not for long PBKDF2 runs.

- **Format serialization.** P-256 public keys in Web Crypto are either raw (65
  bytes uncompressed), JWK, or SPKI DER. Our webbuf format is 33 bytes
  compressed. We'd need to decompress/recompress at the boundary or switch our
  storage format. This might be enough friction to keep P-256 on webbuf even if
  native is faster — the size savings of 33-byte compressed public keys are
  worth preserving.

- **Bun compatibility.** Bun supports `crypto.subtle` on the server but coverage
  and performance may not match Node's `node:crypto`. Worth testing both on Bun.

- **Older browsers.** Web Crypto support is universal in modern browsers but
  older Safari and mobile WebView versions may have bugs. We should check
  caniuse for each specific algorithm.

## Success criteria

- Benchmark report showing native vs WASM times for each primitive, both client
  and server.
- Decision recorded for each primitive: migrate or keep on webbuf.
- For primitives that migrate: working implementation, build passes, tests pass,
  manual smoke test confirms login/save/send/vault still work.
- Main-thread blocking eliminated for PBKDF2 (verifiable by running an animation
  during login and observing no dropped frames).

## Non-goals

- Removing webbuf as a dependency. Some primitives will likely stay on webbuf
  either because native is slower, or because the API mismatch is too painful
  (e.g., public key formats).
- Breaking the user-facing API of `lib/auth.ts`, `lib/message.ts`,
  `lib/vault.ts`. Those should continue to accept and return the same types —
  only the internals change.
- Any change to the cryptographic behavior. Output bytes must be bit-for-bit
  identical to the current implementation.
