+++
title = "Back to NIST: KeyPears Goes All-Standard"
date = "2026-04-12T09:00:00-06:00"
author = "Ryan X. Charles"
+++

Yesterday, KeyPears was running BLAKE3, secp256k1, ACB3 (AES-CBC with a
BLAKE3-MAC), and a custom PBKDF iteration loop. Today, every cryptographic
primitive in the app is NIST-approved: SHA-256, P-256, AES-256-GCM, and
PBKDF2-HMAC-SHA-256 with 1,200,000 total rounds of password stretching. This
post explains why we made the change, how it went, and what we learned along
the way.

If you've been following along, you might notice this is the second time
KeyPears has moved to SHA-256. The previous codebase (kp1) did the same
migration in December. The current rewrite actually started on SHA-256, then
switched to BLAKE3 a week ago, and has now switched back. Six days of BLAKE3
was enough to convince us it was the wrong call. This time, we went all the
way: not just the hash function, but every cryptographic primitive in the
app.

## What changed

Every symmetric primitive is now a NIST standard:

| Purpose     | Before                           | After                    | NIST standard |
| ----------- | -------------------------------- | ------------------------ | ------------- |
| Hash        | BLAKE3                           | SHA-256                  | FIPS 180-4    |
| MAC         | BLAKE3 keyed MAC                 | HMAC-SHA-256             | FIPS 198-1    |
| KDF         | Custom BLAKE3 iteration          | PBKDF2-HMAC-SHA-256      | SP 800-132    |
| Encryption  | ACB3 (AES-256-CBC + BLAKE3-MAC)  | AES-256-GCM              | SP 800-38D    |
| Key pairs   | secp256k1                        | P-256                    | FIPS 186-5    |

The elliptic curve change is the biggest conceptual shift. secp256k1 is the
Bitcoin curve — same size as P-256, comparable security, and some of the
best-quality implementations in existence (`libsecp256k1` is a work of art).
But it isn't a NIST curve. P-256 is. And P-256 is the curve used by TLS,
WebAuthn, JWT, Apple Passkeys, every smartcard, and every browser's built-in
Web Crypto API.

## Why NIST approval matters

None of the BLAKE3 / secp256k1 / ACB3 primitives are cryptographically weak.
BLAKE3 is excellent. secp256k1 has a flawless implementation track record.
ACB3 is a textbook encrypt-then-MAC construction. None of these are the
reason we switched.

We switched because the goal of a security-sensitive app isn't to ship the
most modern cryptography — it's to ship cryptography that a reviewer will
find *boring*. When an auditor opens the crypto folder, we want them to see
exactly the primitives they've seen a hundred times before, in exactly the
construction they expect, with no creative choices to evaluate. That's
what NIST approval buys:

- **Auditability.** Every primitive maps to a public standard with published
  test vectors. Anyone can verify conformance.
- **Institutional trust.** Enterprise customers, government contracts, and
  compliance frameworks (FedRAMP, FIPS 140-3, SOC 2) want to see NIST
  primitives. "We use BLAKE3" is a conversation that takes 30 minutes to
  explain. "We use SHA-256" is a conversation that takes zero minutes.
- **Interoperability.** P-256 is the lingua franca of modern cryptography.
  Hardware support is universal. Key formats are universal. There's no
  friction bridging KeyPears with any other system.
- **Reviewer attention budget.** "Did they roll their own?" is a question
  that never needs to be asked. Every primitive is exactly what the standard
  says it should be.

This is the same reason people use bcrypt over homemade hash iterations,
TLS over custom transport security, and standard OAuth over custom auth
tokens. Boring is a feature.

## From BLAKE3-MAC iteration to PBKDF2

When we picked BLAKE3, the natural KDF construction was to iterate its
keyed-MAC mode: run `blake3Mac(salt, previous)` for however many rounds we
wanted of stretching. That's a perfectly reasonable way to build a KDF on
top of a MAC. BLAKE3's keyed mode is a well-analyzed construction, and
iterating a MAC is how password stretching has worked since before PBKDF2
was standardized. The old code looked like this:

```typescript
function blake3Pbkdf(password, salt, rounds) {
  let result = blake3Mac(salt, password);
  for (let i = 1; i < rounds; i++) {
    result = blake3Mac(salt, result.buf);
  }
  return result;
}
```

Nothing wrong with this. It stretches the password, it's deterministic,
and every round transitively depends on the password — exactly the
properties a KDF needs. If we were committed to BLAKE3, we would have
kept it.

But we're not committed to BLAKE3 anymore, and that changes everything
downstream. Once SHA-256 replaced BLAKE3 as the hash function, the natural
KDF construction changed too. The standardized way to build a KDF on top
of HMAC-SHA-256 is PBKDF2 (RFC 8018, NIST SP 800-132). It has a specific
structure — `U_1 = PRF(password, salt || INT(i))`, iterated with XOR
accumulation across rounds — and that specific structure is what decades
of analysis have been applied to. Using HMAC-SHA-256 in a homemade
iteration loop would still work fine, but it wouldn't be PBKDF2, and the
whole point of this migration is to use exactly the constructions the
standards specify.

Switching to `@webbuf/pbkdf2-sha256` meant deleting `lib/kdf.ts` entirely
and calling a library function that implements the standard algorithm,
test vectors and all. The `pbkdf2` Rust crate wraps HMAC-SHA-256 as the
PRF; there's nothing to get creative about. That's the whole idea.

## The KDF rounds: 600K on both paths

NIST SP 800-132 recommends at least 600,000 rounds of PBKDF2-HMAC-SHA-256
for password-based key derivation. Our old client was doing 100,000 rounds
per tier. We benchmarked BLAKE3 vs HMAC-SHA-256 on 32-byte inputs and found
them essentially tied (~22ms per 100K rounds on an M-series Mac), which
meant the old construction was providing roughly the same stretching as
100K rounds of real PBKDF2 — well below the recommendation.

We bumped the client rounds to 300,000 per tier and the server to 600,000.
Here's the math:

```
Password
  → Password Key      (300K rounds, client)
    → Login Key       (300K rounds, client) → Server hash (600K rounds)
    → Encryption Key  (300K rounds, client)
```

The client-side pair of tiers that derive the encryption key totals 600K
rounds — meeting NIST on its own. The server-side tier that hashes the
login key is *also* 600K rounds — meeting NIST on its own. Every path
through the KDF meets the recommendation independently, with no
combined-computation hand-waving required. The full password-to-stored-hash
chain runs 1,200,000 rounds.

### Why not just one round on the server?

This was a real discussion. Once the client has done 600K rounds of
per-user stretching, the login key arriving at the server is a uniformly
random 256-bit value indistinguishable from a fresh random key. You can't
dictionary-attack a random 256-bit input — the search space is 2^256.
Hashing that value one more time, with one round of HMAC-SHA-256, would
be cryptographically sufficient to prevent preimage attacks and
pass-the-hash attacks. Adding 599,999 more rounds doesn't make the
random-input case any harder.

So why do we do it anyway? **Defense against a hostile client.** The "login
key is a random 256-bit value" assumption only holds if the client
faithfully executes the KDF chain. A user who bypasses the client
JavaScript and sends their raw password directly — whether through a buggy
alternative client, a compromised browser, or deliberate automation —
would be sending a weak input. If the database then leaked, an attacker
could dictionary-attack that user's weak input at whatever work factor
the server imposes. With one round: trivially. With 600K rounds: the
server path alone provides NIST-recommended protection.

This is the kind of edge case that never happens in the normal flow and
often happens in the incident postmortem. Since the cost is small (one
CPU core for a fraction of a second per login, amortized over a 30-day
session), we paid it.

The secondary benefit is the compliance story. "The server performs
600,000 rounds of PBKDF2-HMAC-SHA-256 on every login" is one sentence.
No "combined with client-side rounds," no "if you count the total chain,"
no qualifiers. Just the standardized construction, at the standardized
work factor, in the standardized place.

## Per-user salts, for free

One more cleanup: the server-side KDF was using a global salt, constant
across all users. That's fine for stretching, but it means a database
compromise allows an attacker to run a dictionary attack against all users
in parallel — one pass, many cracks.

The textbook fix is a random per-user salt stored alongside the password
hash. We went with something even simpler: derive the salt deterministically
from the user's ID.

```typescript
function deriveServerSalt(userId: string): FixedBuf<32> {
  return sha256Hash(WebBuf.fromUtf8(`Keypears server login salt v1:${userId}`));
}
```

Since the user ID is a UUIDv7 that's already unique per user and already
available at every call site, this requires zero schema changes, zero new
columns, and zero migration work. The salt is still per-user, and still
breaks parallelism across the user table. The only theoretical downside
versus a random salt is that an attacker who knows the userId can
precompute salt-specific rainbow tables — but since the login key entering
the server is already a uniformly random 256-bit value after 600K rounds
of client-side stretching, the marginal value of a random salt over a
deterministic one is effectively zero.

## The code change itself

Thirteen files, mostly mechanical substitutions:

- `@webbuf/blake3` → `@webbuf/sha256`
- `@webbuf/acb3` → `@webbuf/aesgcm`
- `@webbuf/secp256k1` → `@webbuf/p256`
- `lib/kdf.ts` deleted, replaced by `@webbuf/pbkdf2-sha256`

The function signatures line up almost exactly. `blake3Hash` → `sha256Hash`,
`blake3Mac` → `sha256Hmac`, `acb3Encrypt` → `aesgcmEncrypt`,
`publicKeyCreate` → `p256PublicKeyCreate`. The only wrinkle was that
`sha256Hmac` takes a `WebBuf` for its key parameter, while the old
`blake3Mac` took `FixedBuf<32>` — so a handful of call sites needed a
`.buf` adjustment to unwrap the fixed buffer.

Build passed. All tests passed. Lint was clean. The full commit touched 19
files (13 source files plus `package.json`, `bun.lock`, `CLAUDE.md`, and a
couple of build artifacts), with 78 lines added and 98 removed — a net
shrink, because deleting `lib/kdf.ts` was bigger than all the import changes
combined. For a migration that swaps every cryptographic primitive in the
app, that's about as clean as it gets.

## What we gave up

Being honest: BLAKE3 has real advantages. On large inputs it's substantially
faster than SHA-256 thanks to its tree-hashing structure and SIMD
optimization. The Merkle tree construction enables verified streaming for
content-addressable storage. For use cases like hashing multi-gigabyte
files, BLAKE3 is the right tool.

KeyPears doesn't have those use cases. We hash 32-byte keys, 32-byte ECDH
shared secrets, and small message payloads. At 32 bytes, BLAKE3's SIMD
advantage disappears entirely — a keyed BLAKE3 MAC and an HMAC-SHA-256
both run a single compression function call, and they benchmark within a
few percent of each other. For small-input work, the practical difference
is zero.

secp256k1 is similarly excellent. `libsecp256k1` is one of the most
carefully engineered cryptographic libraries in existence. The only thing
it doesn't have is a NIST stamp of approval. For an application that
wants to be defensibly boring, that's the deciding factor.

## Where we land

Every cryptographic construction in KeyPears now maps to a NIST standard:

- **Hash**: SHA-256 (FIPS 180-4)
- **MAC**: HMAC-SHA-256 (FIPS 198-1)
- **KDF**: PBKDF2-HMAC-SHA-256 (SP 800-132), 600K client + 600K server = 1.2M total rounds
- **Encryption**: AES-256-GCM (SP 800-38D)
- **Key pairs**: P-256 ECDH + ECDSA (FIPS 186-5)
- **Random**: Browser CSPRNG (SP 800-90A via `crypto.getRandomValues`)

The only thing outside NIST's scope is our proof-of-work algorithm
(`pow5-64b`), which isn't a cryptographic primitive in the traditional
sense — it's an application-level anti-spam mechanism. NIST doesn't
standardize PoW algorithms, so there's nothing to conform to.

A security reviewer opening the KeyPears crypto layer today will find
nothing surprising. Just the same algorithms that secure TLS, that back
WebAuthn, that run inside every smartcard and HSM on Earth. The hard
work of cryptographic review has already been done, decades ago, by
people far smarter than us. All we have to do is use what they built,
correctly, and not get creative. That's exactly what we're doing now.

Boring cryptography is good cryptography.
