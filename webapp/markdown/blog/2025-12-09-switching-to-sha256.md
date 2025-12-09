+++
title = "Why We Switched from Blake3 to SHA-256"
date = "2025-12-09T06:00:00-06:00"
author = "KeyPears Team"
+++

**Note:** KeyPears is a work-in-progress open-source password manager and
cryptocurrency wallet. The design decisions described here represent our
development approach and may evolve before our official release.

Last week we completed a significant migration: replacing Blake3 with SHA-256
throughout the KeyPears codebase. This wasn't because Blake3 failed us—it worked
perfectly. We switched because SHA-256 is the industry standard, and that
matters more than we initially appreciated.

This post explains the technical tradeoffs and why we made this decision.

## What We Changed

The migration touched every layer of our stack:

**Dependencies:**

- `@webbuf/blake3` → `@webbuf/sha256`
- `@webbuf/acb3` → `@webbuf/acs2`

**Functions:**

- `blake3Hash()` → `sha256Hash()`
- `blake3Mac()` → `sha256Hmac()`
- `blake3Pbkdf()` → `sha256Pbkdf()`
- `acb3Encrypt()` / `acb3Decrypt()` → `acs2Encrypt()` / `acs2Decrypt()`

**Encryption scheme:**

- ACB3 (AES-256-CBC + Blake3-MAC) → ACS2 (AES-256-CBC + SHA-256-HMAC)

Both hash functions produce 32-byte (256-bit) output, so our `FixedBuf<32>`
types remained unchanged. The migration was primarily find-and-replace with
updated test vectors.

## Why Blake3 Is Excellent

Let's be clear: Blake3 is a technically superior hash function in many respects.

**Speed**: Blake3 is significantly faster than SHA-256, especially for large
data. It achieves this through a Merkle tree construction that enables parallel
hashing across multiple CPU cores. Where SHA-256 processes data sequentially,
Blake3 can divide large inputs into chunks and hash them simultaneously.

**Modern design**: Blake3 was designed in 2020 with modern cryptographic
insights. It's built on the well-analyzed BLAKE2 (used in Argon2, the
recommended password hashing algorithm) and incorporates lessons from decades of
hash function cryptanalysis.

**Versatility**: Blake3 supports keyed hashing (MAC), key derivation (KDF), and
extendable output (XOF) natively. SHA-256 requires wrapper constructions like
HMAC and HKDF for equivalent functionality.

**Simplicity**: Despite its speed, Blake3 has a remarkably simple specification.
The reference implementation is ~500 lines of C.

We were happy with Blake3. Our key derivation system worked flawlessly:

```typescript
// Three-tier key derivation (unchanged structure, new primitives)
function sha256Pbkdf(
  password: string | WebBuf,
  salt: FixedBuf<32>,
  rounds: number = 100_000,
): FixedBuf<32> {
  const passwordBuf = typeof password === "string"
    ? WebBuf.fromUtf8(password)
    : password;

  let result = sha256Hmac(salt, passwordBuf);
  for (let i = 1; i < rounds; i++) {
    result = sha256Hmac(salt, result.buf);
  }
  return result;
}
```

## Why We Switched Anyway

### 1. The Speed Advantage Doesn't Apply to Our Use Case

Blake3's killer feature is parallel hashing of large data. But KeyPears doesn't
hash large data. We hash:

- **Passwords**: 8-64 characters (typically under 100 bytes)
- **Secrets**: API keys, credentials, wallet seeds (typically under 1KB)
- **Keys**: 32-byte fixed buffers

For inputs this small, Blake3's Merkle tree construction provides no benefit.
The parallelization overhead might actually make it slower than sequential
hashing for tiny inputs. And even if Blake3 were faster for small data, the
difference would be measured in microseconds—completely irrelevant when our key
derivation performs 100,000 PBKDF rounds that dominate execution time.

When we profiled vault creation:

- Key derivation: ~800ms (100k rounds × 2 keys)
- Individual hash operations: ~0.001ms

The hash function choice affects performance by roughly 0.0001%. Switching from
Blake3 to SHA-256 has no measurable impact on user experience.

### 2. Industry Standard Matters for Customer Acquisition

When enterprise customers evaluate password managers, they ask questions like:

- "What encryption algorithm do you use?"
- "Is your cryptography FIPS 140-2 compliant?"
- "Do you use industry-standard algorithms?"

With Blake3, our answers required explanation: "We use Blake3, which is a modern
hash function designed in 2020. It's based on BLAKE2, which is used in Argon2.
It's very fast and secure, though it's not yet widely adopted..."

With SHA-256, our answer is: "Yes."

SHA-256 is:

- Part of the SHA-2 family standardized by NIST
- FIPS 140-2 approved
- Used by Bitcoin, TLS, HTTPS, and virtually every security system
- Understood by every security auditor
- Required by many compliance frameworks

The security difference between Blake3 and SHA-256 is negligible for our threat
model—both provide 256-bit security against preimage and collision attacks. But
the compliance difference is significant.

### 3. Battle-Tested at Scale

SHA-256 has been deployed in production systems since 2001. It secures:

- Every Bitcoin transaction ever made (~900 million transactions)
- Every HTTPS connection using TLS (trillions daily)
- Every Git commit in every repository worldwide
- Government systems, financial institutions, healthcare records

This deployment scale represents the most extensive real-world cryptanalysis
possible. If SHA-256 had weaknesses, attackers with billions of dollars in
incentive would have found them.

Blake3 is mathematically sound and designed by respected cryptographers. But it
was released in 2020 and hasn't yet accumulated the same scale of real-world
testing. Given that both algorithms provide equivalent security for our use
case, we chose the one with 24 years of battle-testing.

### 4. Ecosystem Compatibility

SHA-256 implementations exist in every programming language, every platform, and
every hardware security module. If we ever need to:

- Integrate with HSMs for enterprise key management
- Support hardware security keys (FIDO2/WebAuthn)
- Interface with existing enterprise systems
- Pass third-party security audits

SHA-256 will be expected and supported. Blake3 might require custom integration
work.

## What We're Not Saying

This decision is **not** a criticism of Blake3. We want to be explicit:

**Blake3 is secure.** There are no known attacks, weaknesses, or concerns about
Blake3's cryptographic security. It was designed by a team including the
creators of Argon2 and BLAKE2.

**Blake3 is technically superior for large data.** If we were building a backup
system, a file integrity checker, or a content-addressed storage system, Blake3
would be the obvious choice.

**Blake3 may become an industry standard.** It's gaining adoption, and in five
years the "unknown algorithm" concern may disappear. We might even switch back.

We switched because **SHA-256 is good enough for our specific use case, and the
industry standard status provides tangible benefits that Blake3's technical
advantages don't.** This is an engineering tradeoff, not a quality judgment.

## The Migration Process

The actual migration took about a day:

1. **Update dependencies**: Replace `@webbuf/blake3` with `@webbuf/sha256`,
   `@webbuf/acb3` with `@webbuf/acs2`

2. **Update function calls**: Find-and-replace across lib, api-server, tauri-ts,
   webapp

3. **Update test vectors**: SHA-256 produces different output than Blake3, so
   test expectations needed updating

4. **Update documentation**: Replace Blake3 references in crypto.md, auth.md,
   and AGENTS.md

5. **Run tests**: All 71 tests pass (40 in lib, 31 in api-server)

6. **Manual testing**: Create vaults, sync across devices, verify encryption
   works

The migration was straightforward because both hash functions have identical
output sizes (32 bytes) and the `@webbuf` packages have matching APIs. The
hardest part was updating documentation.

**Breaking change note**: This migration breaks compatibility with any existing
encrypted data. Since we're pre-MVP with no real user data, this was acceptable.
A production migration would require a more careful versioning strategy.

## Current Cryptography Stack

After this migration, KeyPears uses:

- **Hashing**: SHA-256 (via `@webbuf/sha256`)
- **MAC**: SHA-256-HMAC (via `sha256Hmac()`)
- **KDF**: Custom PBKDF using SHA-256-HMAC (100,000 rounds)
- **Encryption**: ACS2 = AES-256-CBC + SHA-256-HMAC (via `@webbuf/acs2`)

All cryptographic primitives are NIST-standardized algorithms with decades of
real-world deployment. The underlying implementations are Rust compiled to
WebAssembly, providing both memory safety and cross-platform consistency.

## Lessons Learned

**Technical superiority isn't always the deciding factor.** Blake3 is faster,
more modern, and arguably more elegant. SHA-256 is more widely understood,
trusted, and required. For a security product, trust and compliance matter as
much as technical merit.

**Know your actual use case.** Blake3's parallel hashing is irrelevant when
you're hashing 32-byte keys. We spent time with an optimization we couldn't
benefit from.

**Industry standards exist for good reasons.** NIST standardization, FIPS
compliance, and widespread adoption aren't bureaucratic checkboxes—they
represent accumulated trust that takes decades to build. Sometimes the "boring"
choice is the right choice.

**Migrations are easier early.** Changing cryptographic primitives after MVP
launch would require careful data migration and backward compatibility. Doing it
now, with no real user data, was trivial.

## Conclusion

We switched from Blake3 to SHA-256 not because Blake3 failed, but because
SHA-256 succeeds in ways that matter more for our product: industry recognition,
compliance compatibility, and customer trust.

Blake3 is an excellent hash function, and we'd recommend it for use cases that
benefit from its parallel performance—large file hashing, content-addressed
storage, or high-throughput data processing.

For a password manager where we're hashing small secrets and deriving keys,
SHA-256 provides identical practical security with better industry positioning.
When both options are secure, we chose the one that makes "Do you use
industry-standard cryptography?" easy to answer.

The migration is complete, all tests pass, and vaults sync correctly. We're back
to building features.
