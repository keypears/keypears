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

## Experiment 1 — Benchmark webbuf vs Web Crypto

Build two benchmark harnesses — one for Bun (server-side) and one for the
browser — that measure every primitive head-to-head. Hand the results to a human
to run, collect numbers, then decide per-primitive whether to migrate.

### Location

Create a new workspace package:

```
packages/crypto-bench/
  package.json
  tsconfig.json
  index.html              # browser harness
  src/
    cases.ts              # shared case definitions (imports & inputs)
    bench-util.ts         # timing helper (warmup + N iterations)
    bench-node.ts         # Bun-side entry point
    bench-browser.ts      # browser entry point, mounted by index.html
```

This mirrors the existing `packages/whitepaper-bench` package — same layout
(`index.html` + vite for browser, `bun src/*.ts` for Bun), same scripts pattern,
same dependency style.

### Cases to benchmark

Each case compares `@webbuf/*` (WASM) against `crypto.subtle` (native, available
in both Bun and the browser with the same API).

| Case                | Operation                                        | Input size                                  | Why it matters                                          |
| ------------------- | ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------- |
| `pbkdf2-300k`       | PBKDF2-HMAC-SHA-256, 300K rounds, 32-byte output | 32-byte password                            | Client KDF tier — once per login/save                   |
| `pbkdf2-600k`       | PBKDF2-HMAC-SHA-256, 600K rounds, 32-byte output | 32-byte password                            | Server KDF tier — once per login verification           |
| `sha256-32`         | SHA-256                                          | 32 bytes                                    | Hot path: message key derivation, session token hashing |
| `hmac-sha256-32`    | HMAC-SHA-256                                     | 32-byte key, 32-byte message                | Vault key, PoW challenge signing                        |
| `aesgcm-1kb`        | AES-256-GCM encrypt + decrypt round-trip         | 1 KB plaintext                              | Typical message / vault entry size                      |
| `p256-ecdh`         | P-256 ECDH shared secret derivation              | 32-byte privkey, 33-byte pubkey             | Every message encrypt/decrypt                           |
| `p256-ecdsa-sign`   | P-256 ECDSA sign                                 | 32-byte digest                              | PoW challenge request signing                           |
| `p256-ecdsa-verify` | P-256 ECDSA verify                               | 64-byte sig, 32-byte digest, 33-byte pubkey | PoW challenge request verification                      |

### Benchmark protocol

For each case, both implementations:

1. **Warmup.** Run the operation 3 times, discard results. Primes JIT caches and
   WASM instantiation.
2. **Measure.** Run a fixed number of iterations appropriate to the cost of the
   operation:
   - PBKDF2-300K: **5 iterations** (each takes tens of ms, 5 is enough for
     stable averages)
   - PBKDF2-600K: **3 iterations**
   - SHA-256, HMAC, ECDH, ECDSA: **10,000 iterations**
   - AES-GCM 1KB: **10,000 iterations** (includes encrypt + decrypt)
3. **Report.** Print: total time, operations/sec, time per operation in ms (or
   µs where appropriate), and the ratio of native to webbuf.

### Shared timing helper

`bench-util.ts` exports a single function used by both entry points:

```typescript
export async function bench(
  name: string,
  iterations: number,
  fn: () => void | Promise<void>,
): Promise<{ name: string; iterations: number; totalMs: number; perOpMs: number; opsPerSec: number }>;
```

It handles warmup (3 untimed calls), awaits if the fn returns a promise, uses
`performance.now()` for timing, and returns the stats object. The two entry
points format the output the same way so results can be compared side by side.

### Main-thread blocking check (browser only)

Web Crypto's main selling point for PBKDF2 isn't just speed — it's that
`deriveBits` runs off the main thread in modern browsers, so the UI doesn't
freeze during a long derivation. The browser harness should include a visible
test for this: a spinning CSS animation (or a requestAnimationFrame loop
incrementing a counter) running while each PBKDF2 benchmark runs. If the
animation stutters during the webbuf run and stays smooth during the Web Crypto
run, that confirms native is off-thread.

### What the human runs

Two commands, both from `packages/crypto-bench/`:

```bash
bun src/bench-node.ts              # server-side (Bun + crypto.subtle)
bun run dev                        # browser-side (opens index.html in vite)
```

Each emits a table like:

```
Case              webbuf (ms/op)    webCrypto (ms/op)   speedup
pbkdf2-300k       66.2              8.3                 8.0x
pbkdf2-600k       132.5             16.1                8.2x
sha256-32         0.0020            0.0012              1.7x
...
```

### Deliverables

1. `packages/crypto-bench/` built out with the two harnesses.
2. A human-readable results table pasted into this issue's next experiment
   ("Experiment 2: Benchmark results").
3. A decision per primitive: migrate to Web Crypto, or keep on webbuf, with
   rationale.

### Non-goals for this experiment

- Not implementing any migration yet. This experiment only produces numbers and
  a decision — the actual code changes come in a later experiment.
- Not benchmarking browser-only or node-only APIs beyond the eight cases above.
  We want to know about the primitives we actually use, not build a
  general-purpose crypto benchmark.

### Result — Pass

Both harnesses were built under `packages/crypto-bench/` and run successfully.
Build passes, both entry points execute, results below.

#### Node / Bun results (M-series Mac, Bun 1.3.5, darwin arm64)

```
pbkdf2-300k      webbuf  82.299 ms/op   webCrypto  16.143 ms/op   webCrypto 5.10x faster
pbkdf2-600k      webbuf 164.992 ms/op   webCrypto  32.374 ms/op   webCrypto 5.10x faster
sha256-32        webbuf   0.55 µs/op    webCrypto   0.84 µs/op    webbuf    1.53x faster
hmac-sha256-32   webbuf   0.90 µs/op    webCrypto   9.11 µs/op    webbuf   10.07x faster
aesgcm-1kb       webbuf  24.48 µs/op    webCrypto  18.86 µs/op    webCrypto 1.30x faster
p256-ecdh        webbuf 179.63 µs/op    webCrypto  34.29 µs/op    webCrypto 5.24x faster
p256-sign        webbuf 200.44 µs/op    webCrypto  20.84 µs/op    webCrypto 9.62x faster
p256-verify      webbuf 370.14 µs/op    webCrypto  36.75 µs/op    webCrypto 10.07x faster
```

#### Browser results (Chrome 147 on macOS, same Mac)

```
pbkdf2-300k      webbuf  75.500 ms/op   webCrypto  16.360 ms/op   webCrypto  4.61x faster
  main thread:  webbuf 0/22 frames (100% dropped)   webCrypto 36/4 frames (0% dropped)

pbkdf2-600k      webbuf 155.700 ms/op   webCrypto  32.067 ms/op   webCrypto  4.86x faster
  main thread:  webbuf 0/28 frames (100% dropped)   webCrypto 100/5 frames (0% dropped)

sha256-32        webbuf   0.56 µs/op    webCrypto   1.23 µs/op    webbuf    2.20x faster
hmac-sha256-32   webbuf   0.85 µs/op    webCrypto   1.26 µs/op    webbuf    1.48x faster
aesgcm-1kb       webbuf  26.98 µs/op    webCrypto   3.76 µs/op    webCrypto 7.18x faster
p256-ecdh        webbuf 286.80 µs/op    webCrypto  44.10 µs/op    webCrypto 6.50x faster
p256-sign        webbuf 311.00 µs/op    webCrypto  26.50 µs/op    webCrypto 11.74x faster
p256-verify      webbuf 588.30 µs/op    webCrypto  54.80 µs/op    webCrypto 10.74x faster
```

### Analysis

**PBKDF2 is the blockbuster result — migrate both tiers.** 5x faster raw, and
the main-thread measurement is the real eye-opener. Webbuf PBKDF2 runs
synchronously on the main thread and drops 100% of expected frames during the
derivation. Web Crypto PBKDF2 runs off-thread: during the 600K-round bench, the
rAF loop rendered 100 frames while only 5 were expected (i.e., Web Crypto
completed so fast the rAF loop kept firing freely). This means the migration
gives us two distinct wins:

1. 5x faster KDF — logins drop from ~300ms total to ~64ms total.
2. Zero UI freeze on login/save — the spinner animates smoothly.

On slower hardware the absolute delta is larger. A phone at 500ms per tier on
webbuf would drop to ~100ms on Web Crypto.

**All P-256 operations are 5-12x faster native.** This was stronger than
expected. ECDH (5-6x), ECDSA sign (9-12x), ECDSA verify (10-11x). In both Bun
and Chrome. Migrate all three. The migration cost is real but bounded: we need a
compressed-↔-uncompressed public key converter at the Web Crypto boundary since
Web Crypto wants 65-byte uncompressed keys and our storage format is 33-byte
compressed. And we need to figure out how to sign raw pre-computed digests (Web
Crypto's ECDSA hashes the message internally).

**AES-256-GCM has a split personality:** 1.3x faster on Bun, **7.2x faster on
Chrome.** The Chrome number is dramatic and almost certainly reflects AES-NI
hardware acceleration that webbuf's WASM cannot reach. Migrate — the
browser-side win alone justifies it.

**SHA-256 and HMAC-SHA-256 on small inputs: keep on webbuf.** This was the
surprise of the experiment. Web Crypto loses on both — SHA-256 by 1.5-2.2x,
HMAC-SHA-256 by 1.5-10x. The explanation is async/promise wrapper overhead: for
an operation that takes ~500ns-1µs natively, the cost of creating a Promise and
resolving it dominates. Bun's HMAC-SHA-256 at 9.1µs/op (10x slower than webbuf's
0.9µs) is especially striking and suggests per-call allocation in Bun's
`crypto.subtle.sign('HMAC', ...)` path. Staying on webbuf for these is a strict
win with no downside.

**Main-thread measurement caveat:** For the cheap operations (SHA-256, HMAC,
AES-GCM, all P-256 ops) both paths show "100% frames dropped," but the expected
frame counts are all 1-35 frames because each benchmark only runs a few
milliseconds total. This is a measurement artifact of running tight loops under
rAF — the event loop can't squeeze in a frame between `for` iterations even on
the async path. The metric is only meaningful for the long PBKDF2 benchmarks,
where it clearly shows the off-main-thread behavior we wanted.

### Per-primitive decisions

| Primitive             | Decision        | Reason                                                         |
| --------------------- | --------------- | -------------------------------------------------------------- |
| PBKDF2-HMAC-SHA-256   | **Migrate**     | 5x faster, eliminates UI freeze on login/save                  |
| P-256 ECDH            | **Migrate**     | 5-6x faster                                                    |
| P-256 ECDSA sign      | **Migrate**     | 9-12x faster                                                   |
| P-256 ECDSA verify    | **Migrate**     | 10-11x faster                                                  |
| AES-256-GCM           | **Migrate**     | 1.3x on Bun, 7.2x on Chrome (AES-NI hardware acceleration)     |
| SHA-256 (single, 32B) | **Keep webbuf** | 1.5-2.2x faster than Web Crypto (promise overhead dominates)   |
| HMAC-SHA-256 (32B)    | **Keep webbuf** | 1.5-10x faster than Web Crypto (per-call allocation in subtle) |

### Extrapolated user impact

**Login (Chrome, M-series Mac):**

- Old: 2 × 76ms client PBKDF2 + 156ms server PBKDF2 = ~308ms, with a 150ms UI
  freeze
- New: 2 × 16ms client + 32ms server = ~64ms, zero UI freeze
- **~5x faster, UI stays responsive**

**Per-message decryption (Chrome, 50 messages on channel load):**

- Old: 50 × (287µs ECDH + 27µs AES-GCM) = 16ms sync blocking
- New: 50 × (44µs ECDH + 4µs AES-GCM) = 2.4ms sync blocking

### Known complications for the migration experiment

1. **Async everywhere.** Web Crypto is promise-based. `lib/auth.ts` functions
   like `derivePasswordKey()` become async and their callers must await.
2. **P-256 key format.** Web Crypto uses 65-byte uncompressed public keys (or
   JWK). Our storage format is 33-byte compressed. We need a converter at the
   boundary. The 33-byte format stays in the database to preserve the storage
   savings.
3. **ECDSA over raw digests.** Web Crypto's ECDSA hashes its input message
   internally. We currently pass a pre-computed digest (32 bytes) as the message
   to be signed. Either we accept Web Crypto's hash-the-message behavior and
   change the PoW signing protocol slightly, or we find a way to get Web Crypto
   to sign a raw digest directly (the only clean path is to construct an ASN.1
   DER signature manually — painful).
4. **Bun vs browser symmetry.** Both environments expose `crypto.subtle` with
   the same API. The server-side code in `user.server.ts` and elsewhere can use
   the same Web Crypto calls as the client, which is great for code sharing.

## Experiment 2 — Migrate PBKDF2 and AES-GCM to Web Crypto

Migrate the two primitives that give us the biggest wins with the least
friction: **PBKDF2-HMAC-SHA-256** (5x speedup + eliminates the login UI
freeze) and **AES-256-GCM** (7x speedup on Chrome via AES-NI). Leave P-256
on webbuf for now — it's covered by a separate experiment because the
migration touches private key format, public key format, and the ECDSA
protocol change, all of which deserve their own design.

### Scope

**In scope:**
- PBKDF2: client `derivePasswordKey`, `deriveLoginKeyFromPasswordKey`,
  `deriveEncryptionKeyFromPasswordKey`, and server `hashLoginKey`.
- AES-GCM: `encryptMessage`, `encryptSecretMessage`, `decryptMessageContent`,
  `encryptVaultEntry`, `decryptVaultEntry`, `tryDecryptVaultEntry`,
  `generateAndEncryptKeyPairFromEncryptionKey` (the AES-GCM encrypt of the
  private key), and `decryptPrivateKey`.
- Propagation of async through all callers.
- Refactoring the two render-time decryption sites to pre-compute in a
  `useEffect`.

**Out of scope (deferred to experiment 3):**
- P-256 ECDH (`computeMessageKey` keeps using webbuf's `p256SharedSecret`).
- P-256 ECDSA sign/verify (`signPowRequest` / verification in
  `api.router.ts` stays on webbuf).
- P-256 key pair generation (still via webbuf's `p256PublicKeyCreate`).
- P-256 public/private key format conversion. Not needed because we're not
  touching any P-256 Web Crypto call.

**Kept on webbuf (per experiment 1 decisions):**
- SHA-256 single-hash (`sha256Hash`).
- HMAC-SHA-256 (`sha256Hmac`).

### What changes in `lib/auth.ts`

The three KDF functions become async and use `crypto.subtle`:

```typescript
export async function derivePasswordKey(password: string): Promise<FixedBuf<32>> {
  const passwordBuf = new TextEncoder().encode(password);
  const salt = derivePasswordSalt(password).buf;
  const material = await crypto.subtle.importKey(
    "raw",
    passwordBuf,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: CLIENT_KDF_ROUNDS, hash: "SHA-256" },
    material,
    256,
  );
  return FixedBuf.fromBuf(32, WebBuf.fromUint8Array(new Uint8Array(bits)));
}
```

(Similar structure for `deriveLoginKeyFromPasswordKey` and
`deriveEncryptionKeyFromPasswordKey`.)

The `generateAndEncryptKeyPairFromEncryptionKey` and `decryptPrivateKey`
functions become async because they call AES-GCM. P-256 key generation
still uses webbuf:

```typescript
export async function generateAndEncryptKeyPairFromEncryptionKey(
  encryptionKey: FixedBuf<32>,
): Promise<{ publicKey: string; encryptedPrivateKey: string }> {
  const privateKey = FixedBuf.fromRandom(32);
  const publicKey = p256PublicKeyCreate(privateKey);            // webbuf (sync)
  const encryptedPrivateKey = await aesgcmEncryptNative(       // Web Crypto (async)
    privateKey.buf,
    encryptionKey,
  );
  return {
    publicKey: publicKey.buf.toHex(),
    encryptedPrivateKey: encryptedPrivateKey.toHex(),
  };
}
```

`signPowRequest` stays sync (uses webbuf `p256Sign` and `sha256Hash`).

### New helper: `aesgcmEncryptNative` / `aesgcmDecryptNative`

Rather than sprinkling `crypto.subtle` calls throughout the codebase, add
a small helper that exposes the same shape as webbuf's `aesgcmEncrypt` /
`aesgcmDecrypt` but uses Web Crypto internally. Put this in a new file
`lib/aesgcm.ts`:

```typescript
// lib/aesgcm.ts
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";

export async function aesgcmEncryptNative(
  plaintext: WebBuf,
  key: FixedBuf<32>,
): Promise<WebBuf> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buf,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    plaintext,
  );
  // Match webbuf's format: [iv (12 bytes)] || [ciphertext || tag]
  return WebBuf.concat([
    WebBuf.fromUint8Array(iv),
    WebBuf.fromUint8Array(new Uint8Array(ciphertext)),
  ]);
}

export async function aesgcmDecryptNative(
  ciphertext: WebBuf,
  key: FixedBuf<32>,
): Promise<WebBuf> {
  const iv = ciphertext.slice(0, 12);
  const ct = ciphertext.slice(12);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buf,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ct,
  );
  return WebBuf.fromUint8Array(new Uint8Array(plaintext));
}
```

The ciphertext format must match `@webbuf/aesgcm` byte-for-bit so that
existing encrypted data (if any) can still be decrypted during
development. Looking at the webbuf source, `aesgcmEncrypt` produces
`[iv (12 bytes)] || [ciphertext || tag (16 bytes)]`, and Web Crypto's
`crypto.subtle.encrypt` with AES-GCM produces `[ciphertext || tag (16 bytes)]`
internally. So we just prepend our 12-byte IV to match the layout.
**Important verification step:** write a cross-check test that encrypts
with the helper and decrypts with webbuf (and vice versa) to confirm
format compatibility.

### Changes in `lib/message.ts`

Every call to `aesgcmEncrypt`/`aesgcmDecrypt` is replaced with the async
native helper. Functions become async:

```typescript
export async function encryptMessage(
  text: string,
  myPrivKey: FixedBuf<32>,
  theirPubKey: FixedBuf<33>,
): Promise<string> {
  const key = computeMessageKey(myPrivKey, theirPubKey);  // webbuf, sync
  const content = JSON.stringify({ version: 1, type: "text", text });
  const encrypted = await aesgcmEncryptNative(WebBuf.fromUtf8(content), key);
  return encrypted.toHex();
}
```

Same pattern for `encryptSecretMessage`, `decryptMessageContent`,
`decryptMessage`. `computeMessageKey` stays sync (it uses webbuf ECDH and
webbuf SHA-256, both still sync in this experiment).

### Changes in `lib/vault.ts`

Same pattern — AES-GCM calls become async, functions become async.
`deriveVaultKey` stays sync (it uses webbuf `sha256Hmac`, which we're
keeping).

```typescript
export async function encryptVaultEntry(...): Promise<string> { ... }
export async function decryptVaultEntry(...): Promise<VaultEntryData> { ... }
export async function tryDecryptVaultEntry(...): Promise<DecryptResult> { ... }
```

### Changes in `server/user.server.ts`

`hashLoginKey` becomes async. All six callers (`createUserForDomain`,
`resetUserPassword`, `saveUser`, `changePassword`, `reEncryptKey`,
`verifyLogin`) are already in `async` functions and just need an `await`
added.

```typescript
async function hashLoginKey(loginKeyHex: string, userId: string): Promise<string> {
  const loginKeyBuf = new Uint8Array(WebBuf.fromHex(loginKeyHex));
  const salt = deriveServerSalt(userId).buf;
  const material = await crypto.subtle.importKey(
    "raw",
    loginKeyBuf,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: SERVER_KDF_ROUNDS, hash: "SHA-256" },
    material,
    256,
  );
  return Buffer.from(bits).toString("hex");
}
```

Bun exposes `crypto.subtle` globally, so no imports needed.

### Async propagation through callers

Every already-async caller just gets `await` added. The grep from the
analysis confirmed every call site is in an async context, with two
exceptions that need the render-time refactor below.

Files that need mechanical `await` additions:

- `routes/login.tsx` — `handlePowComplete`
- `routes/_app/welcome.tsx` — save handler
- `routes/_app/_saved/_chrome/password.tsx` — form handler (includes an
  inner loop that re-encrypts keys, each iteration needs `await`)
- `routes/_app/_saved/_chrome/keys.tsx` — rotate + reEncrypt handlers
- `routes/_app/_saved/_chrome/domains.tsx` — createDomainUser, resetPassword
- `routes/_app/_saved/_chrome/send.tsx` — send handler
- `routes/_app/_saved/_chrome/vault.tsx` — search handler, create handler,
  and the `useEffect` that builds the keyMap (async IIFE pattern)
- `routes/_app/_saved/vault.$id.tsx` — the `useEffect` for keyMap, save
  handler, share handler, restore-version handler
- `routes/_app/_saved/channel.$address.tsx` — handleSaveSecret, handleSend
  (already async, just needs awaits)

### The render-time decryption refactor

Two locations call decryption functions from inside JSX render, which is
incompatible with async. These need to be rewritten to pre-compute results
in a `useEffect` and store them in state.

**`channel.$address.tsx` — `tryDecrypt` at line 215, called at line 499:**

Current structure:

```typescript
function tryDecrypt(msg): DecryptResult { ... synchronous ... }

// In JSX:
{messageList.map((msg) => {
  const result = tryDecrypt(msg);
  return <MessageBubble result={result} />;
})}
```

New structure:

```typescript
const [decryptedMap, setDecryptedMap] = useState<Map<string, DecryptResult>>(
  new Map(),
);

useEffect(() => {
  let cancelled = false;
  (async () => {
    const next = new Map(decryptedMap);
    // Only decrypt messages we haven't seen yet
    for (const msg of messageList) {
      if (next.has(msg.id)) continue;
      const result = await tryDecryptAsync(msg);
      if (cancelled) return;
      next.set(msg.id, result);
    }
    if (!cancelled) setDecryptedMap(next);
  })();
  return () => { cancelled = true; };
}, [messageList, keyMap, currentPasswordHash, encryptionKey]);

// In JSX:
{messageList.map((msg) => {
  const result = decryptedMap.get(msg.id);
  if (!result) return <MessagePlaceholder key={msg.id} />;
  return <MessageBubble result={result} />;
})}
```

Key design choices:

- **Memoize by message ID.** Messages that have already been decrypted
  stay in the map across re-renders and across polls for new messages.
  Only new messages pay the decryption cost.
- **Cancellation via `cancelled` flag.** If the effect re-runs (e.g., the
  user switches channels) the old async loop is discarded rather than
  racing to `setState` with stale data.
- **Clear the map when the encryption key or password changes.** Use
  these as dependencies to invalidate all decrypted results when the
  user logs out or changes password.
- **Placeholder during decryption.** A brief `<MessagePlaceholder />` is
  shown while decryption is in flight. In practice this is milliseconds
  for the first paint and not visible for subsequent messages.

**`vault.$id.tsx` — `tryDecryptVaultEntry` at line 421 and line 1063:**

Same pattern but simpler because there's only one entry + a bounded list
of older versions. Pre-decrypt both in a `useEffect`:

```typescript
const [decrypted, setDecrypted] = useState<DecryptResult | null>(null);
const [versionsDecrypted, setVersionsDecrypted] = useState<Map<string, DecryptResult>>(
  new Map(),
);

useEffect(() => {
  let cancelled = false;
  if (!keyInfo) {
    setDecrypted(null);
    return;
  }
  (async () => {
    const d = await tryDecryptVaultEntry(entry.encryptedData, keyInfo.privateKey);
    if (cancelled) return;
    setDecrypted(d);
    const vmap = new Map<string, DecryptResult>();
    for (const ver of olderVersions) {
      const verKeyInfo = keyMap.get(ver.publicKey);
      if (!verKeyInfo) continue;
      vmap.set(
        ver.id,
        await tryDecryptVaultEntry(ver.encryptedData, verKeyInfo.privateKey),
      );
    }
    if (cancelled) return;
    setVersionsDecrypted(vmap);
  })();
  return () => { cancelled = true; };
}, [entry, olderVersions, keyInfo, keyMap]);
```

### Verification

1. **Format compatibility test.** Write a one-shot test in
   `webapp/src/lib/aesgcm.test.ts`:
   - Encrypt data with the new `aesgcmEncryptNative` helper
   - Decrypt it with webbuf's `aesgcmDecrypt`
   - And vice versa
   - Confirm plaintext round-trips both ways
2. **`bun run build`** — compiles with no errors
3. **`bun run test`** — all existing tests pass
4. **`bun run lint`** — clean
5. **`db:clear` + `db:push`** — fresh DB
6. **Manual smoke test:**
   - Create an account (watches PBKDF2 run off-thread, no UI freeze)
   - Save the account with a password (more PBKDF2, still no freeze)
   - Log out, log back in (full PBKDF2 chain, observe snappy login)
   - Send a message to yourself via another account (AES-GCM encrypt/decrypt)
   - Open the channel and see the message decrypt (render-time refactor
     works, no black screen)
   - Add 10+ messages and scroll the channel (incremental decryption works)
   - Create a vault entry (AES-GCM encrypt)
   - Open the vault entry (render-time refactor works)
   - Edit the vault entry and save (AES-GCM re-encrypt)
   - Rotate a key (keypair gen still uses webbuf, but the private key
     encryption uses native AES-GCM)
   - Change password (re-encrypts locked keys — inner loop with awaits)
7. **Spinner animation test.** Start the app, open DevTools, trigger a
   login, and watch any CSS animation on the page during the PBKDF2 run.
   It should stay smooth. Before this experiment, it would stutter.

### Expected outcomes

- Login latency on a fast Mac drops from ~300ms to ~64ms (experiment 1
  benchmark extrapolation)
- UI no longer freezes during login, save, or password change
- AES-GCM operations in the browser become ~7x faster (AES-NI)
- Everything else behaves identically, byte-for-byte
