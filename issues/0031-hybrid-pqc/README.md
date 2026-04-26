+++
status = "open"
opened = "2026-04-26"
+++

# Switch to hybrid post-quantum cryptography

## Goal

Replace KeyPears' pure ML-DSA-65 / ML-KEM-768 cryptography with hybrid composite
constructions that combine classical and post-quantum algorithms. Research which
constructions are standardized or closest to standardization, and adopt them.

## Background

### Why hybrid

KeyPears currently uses pure post-quantum cryptography — no classical algorithms
remain. This is a bet that ML-DSA and ML-KEM have no structural flaws. The
industry consensus is that this bet is premature:

- **IETF OpenPGP PQC draft** (`draft-ietf-openpgp-pqc`): specifies composite
  ML-KEM + ECC for encryption and composite ML-DSA + ECC for signatures.
- **Signal PQXDH**: hybrid X25519 + ML-KEM-768.
- **Chrome TLS**: hybrid X25519 + ML-KEM-768 for key exchange.
- **NIST guidance**: recommends hybrid during the transition period.
- **Google Quantum AI paper** (Babbush et al., 2026): recommends composite
  signatures for defense-in-depth.
- **HN consensus**: hybrid is a "no-regret move" — if lattice crypto breaks,
  classical still protects; if quantum arrives, PQ still protects.

GnuPG's incompatible PQC implementation (proprietary format, not RFC 9580
compliant) demonstrates the importance of following standards rather than
inventing proprietary constructions.

### What hybrid means

An attacker must break BOTH algorithms to compromise the system:

- **Encryption**: classical key exchange (ECDH/X25519) AND ML-KEM-768 must both
  be broken to recover the message key.
- **Signatures**: classical signature (ECDSA/Ed25519) AND ML-DSA-65 must both be
  forged to impersonate a user.

### What we already have

WebBuf already provides hybrid encryption:

- `@webbuf/aesgcm-p256dh-mlkem` — AES-256-GCM with P-256 ECDH + ML-KEM-768.
  HKDF-SHA-256 key derivation, concatenated shared secrets in classical-first
  order per `draft-ietf-tls-hybrid-design`.

WebBuf does NOT yet have composite signatures. This would need to be built.

### Standards to research

**Encryption / key exchange:**

- `draft-ietf-tls-hybrid-design` — TLS 1.3 hybrid key exchange
- Signal PQXDH specification
- IETF OpenPGP PQC draft (composite KEM construction)
- NIST SP 800-56C Rev. 2 (key derivation for hybrid)

**Signatures:**

- IETF OpenPGP PQC draft (composite ML-DSA + ECC signatures)
- `draft-ietf-lamps-pq-composite-sigs` — IETF composite signatures for X.509
- `draft-ietf-lamps-pq-composite-kem` — IETF composite KEM for X.509
- Any NIST guidance on composite signatures

**Questions to answer:**

1. Which classical algorithm for key exchange — P-256 ECDH or X25519?
2. Which classical algorithm for signatures — P-256 ECDSA or Ed25519?
3. What is the standardized composite signature format? (Concatenate both
   signatures? Sign with both independently? What's the canonical envelope?)
4. Does the user need three key pairs (classical signing + PQ signing + PQ KEM)
   or can it be simplified?
5. What does `@webbuf/aesgcm-p256dh-mlkem` already handle correctly, and what
   needs changing?

### Key pair model

Currently each user has two key pairs:

- ML-DSA-65 (signing)
- ML-KEM-768 (encryption)

Hybrid would require adding classical key pairs:

- P-256 or Ed25519 (classical signing)
- P-256 or X25519 (classical key exchange) — unless `aesgcm-p256dh-mlkem`
  handles this at the message level without a persistent classical DH key

The `@webbuf/aesgcm-p256dh-mlkem` package uses ephemeral P-256 ECDH — the sender
generates a fresh P-256 key pair per message. The persistent key is only the
ML-KEM encap key. This may simplify the key model.

For composite signatures, the user would need a persistent classical signing key
alongside the ML-DSA-65 key. A composite signature = classical sig + PQ sig
concatenated.

## Plan

1. Research the exact constructions becoming standard for hybrid PQC —
   encryption and signatures. Determine which classical algorithms to use.
2. Implement hybrid encryption and composite signatures in KeyPears.

## Experiment 1: Survey hybrid PQC constructions

### Goal

Identify what every major project and standards body is doing for hybrid PQC.
Determine which construction KeyPears should adopt.

### Findings

#### Production deployments (KEM only — no PQ signatures in production)

**Signal PQXDH** (deployed late 2023):
- KEM: X25519 + ML-KEM-1024 (Kyber-1024)
- Combiner: HKDF-SHA-512 over concatenated DH outputs + KEM shared secret
- Signatures: still classical (XEdDSA on Curve25519) — no PQ signatures
- Status: production, formally verified

**Chrome TLS X25519MLKEM768** (deployed Chrome 124, early 2024):
- KEM: X25519 + ML-KEM-768
- Combiner: simple concatenation → TLS HKDF key schedule
- Ordering: ML-KEM-SS first, then X25519-SS (FIPS-approved scheme first)
- Signatures: still classical (RSA/ECDSA certificates)
- Status: production, also supported by Cloudflare and AWS

**Chrome TLS SecP256r1MLKEM768**:
- KEM: P-256 ECDH + ML-KEM-768
- Same pattern, P-256 SS first
- Status: production

#### Standards-track drafts

**IETF OpenPGP PQC** (`draft-ietf-openpgp-pqc-07`, Feb 2025):
- KEM (MUST): ML-KEM-768 + X25519
- KEM combiner: SHA3-256 over all inputs (both shared secrets, both
  ciphertexts, both public keys, algorithm ID, domain separator
  `"OpenPGPCompositeKDFv1"`)
- Signatures (MUST): ML-DSA-65 + Ed25519
- Signature method: both sign the same SHA3-256 pre-hashed digest
  independently. Both must verify. Concatenated in the packet.
- Status: active IETF draft, interop testing underway

**IETF LAMPS Composite Signatures** (`draft-ietf-lamps-pq-composite-sigs-19`,
Apr 2026):
- ML-DSA-65 + Ed25519-SHA512 (defined combination)
- ML-DSA-65 + ECDSA-P256-SHA512 (also defined)
- ML-DSA-44 + Ed25519-SHA512 (lower security level)
- Combiner: pre-hash with domain separation. Message representative:
  `Prefix || Label || len(ctx) || ctx || PH(M)` where Prefix =
  `"CompositeAlgorithmSignatures2025"` and Label is per-algorithm.
  Both algorithms sign this independently. Serialized as concatenation
  (ML-DSA has fixed-length output).
- Status: Standards Track draft-19, nearing completion

**IETF LAMPS Composite KEM** (`draft-ietf-lamps-pq-composite-kem-14`,
Mar 2026):
- ML-KEM-768 + X25519 (defined)
- ML-KEM-768 + P-256 ECDH (defined)
- Combiner: SHA3-256 over `mlkemSS || tradSS || tradCT || tradPK || Label`.
  Includes ciphertext and public key for context binding.
- ECDH "promoted to KEM" via ephemeral keypair (sender generates fresh key
  per message, sender's public key = ciphertext)
- Status: Standards Track draft-14

**NIST SP 800-227** (Sep 2025):
- General KEM recommendations, not hybrid-specific
- Points to SP 800-56Cr2 for combining shared secrets via approved KDFs

### Analysis

#### The emerging standard pairings

The clearest consensus across ALL standards bodies:

| Purpose | Classical | PQ | Sources |
|---------|-----------|-----|---------|
| KEM | X25519 | ML-KEM-768 | Signal, Chrome, OpenPGP, LAMPS |
| Signatures | Ed25519 | ML-DSA-65 | OpenPGP (MUST), LAMPS |

The Curve25519 family (X25519 for KEM, Ed25519 for signatures) is the
universal classical choice. P-256 is supported but secondary.

#### KEM combiner consensus

Three approaches exist, from simplest to most thorough:

1. **Concatenation → existing KDF** (TLS): `mlkemSS || ecdhSS` fed into
   HKDF. Simplest. Works because TLS already has a robust key schedule.
2. **HKDF over concatenation** (Signal): same idea with explicit HKDF call.
3. **SHA3-256 with full context** (OpenPGP, LAMPS): includes ciphertexts,
   public keys, algorithm label, domain separator. Strongest binding.

The LAMPS/OpenPGP approach is the most rigorous but also the most complex.
For a messaging protocol like KeyPears, the Signal/TLS approach (HKDF over
concatenated shared secrets) is sufficient and already implemented in
`@webbuf/aesgcm-p256dh-mlkem`.

#### Composite signature consensus

The pattern is consistent:
1. Pre-hash the message (with domain-separated prefix)
2. Both algorithms sign the same pre-hashed message independently
3. Concatenate both signatures (ML-DSA has fixed length, so splitting is
   trivial)
4. Both must verify

This is NOT yet implemented in webbuf.

### What webbuf has vs. what's needed

| Need | WebBuf package | Status |
|------|---------------|--------|
| Hybrid KEM (P-256 + ML-KEM) | `@webbuf/aesgcm-p256dh-mlkem` | Ready |
| Hybrid KEM (X25519 + ML-KEM) | — | Missing (no X25519 package) |
| P-256 ECDH | `@webbuf/p256` | Ready |
| P-256 ECDSA | `@webbuf/p256` | Ready |
| X25519 | — | Missing |
| Ed25519 | — | Missing |
| ML-KEM-768 | `@webbuf/mlkem` | Ready |
| ML-DSA-65 | `@webbuf/mldsa` | Ready |
| Composite signatures | — | Missing |

### Decision: which construction to adopt

**Option A: P-256 family** (what we have)
- KEM: P-256 ECDH + ML-KEM-768 via `@webbuf/aesgcm-p256dh-mlkem`
- Signatures: P-256 ECDSA + ML-DSA-65 (build composite in webbuf)
- Pro: all packages exist or only need a thin composite wrapper
- Con: not the primary pairing in OpenPGP/LAMPS (they prefer Curve25519)

**Option B: Curve25519 family** (what the standards prefer)
- KEM: X25519 + ML-KEM-768
- Signatures: Ed25519 + ML-DSA-65
- Pro: matches OpenPGP MUST, Signal, Chrome, LAMPS primary pairings
- Con: requires building X25519 and Ed25519 packages in webbuf first

**Option C: Mixed** (P-256 for KEM since we have it, Ed25519 for signatures)
- Not a standard combination — avoid.

**Recommendation: Option A (P-256 family) for now.** The `@webbuf/aesgcm-
p256dh-mlkem` package already exists and follows the TLS/Signal combiner
pattern. P-256 + ML-KEM-768 is a defined combination in LAMPS
(`id-MLKEM768-ECDH-P256-SHA3-256`). P-256 ECDSA + ML-DSA-65 is also defined
in LAMPS (`id-MLDSA65-ECDSA-P256-SHA512`). We can ship hybrid immediately
without building new webbuf primitives.

If we later want to align with the OpenPGP MUST pairing (Curve25519), we can
add X25519 and Ed25519 to webbuf and switch. But P-256 hybrid is strictly
better than pure PQ, which is what we have now.

### What needs to happen

1. **Encryption**: swap `@webbuf/aesgcm-mlkem` for
   `@webbuf/aesgcm-p256dh-mlkem` in message encryption. The hybrid package
   already exists with HKDF-SHA-256 combiner and version byte `0x02`.

2. **Signatures**: build a composite signature helper — sign with both P-256
   ECDSA and ML-DSA-65, verify both. This can be a thin wrapper in keypears
   (or a new webbuf package). Format: ML-DSA-65 signature (3,309 bytes) ||
   P-256 ECDSA signature (64 bytes). Split at byte 3,309.

3. **Key model**: each user needs three key pairs:
   - P-256 (classical signing + classical ECDH for hybrid KEM)
   - ML-DSA-65 (PQ signing)
   - ML-KEM-768 (PQ encryption)
   
   Wait — `@webbuf/aesgcm-p256dh-mlkem` uses EPHEMERAL P-256 ECDH (fresh key
   per message). The sender doesn't need a persistent P-256 DH key. The
   recipient only needs the ML-KEM encap key. So for encryption, the key
   model stays as-is (ML-KEM-768 encap key only). The P-256 ephemeral is
   generated inside the package.

   For signatures, the user needs:
   - P-256 signing key pair (persistent, for composite signatures)
   - ML-DSA-65 signing key pair (persistent, for composite signatures)
   - ML-KEM-768 encap key pair (persistent, for encryption)

   That's three key pairs per user instead of two.

### Result: Pass

The industry consensus is clear: hybrid with Curve25519 or P-256 as the
classical component. P-256 is a valid standardized pairing (LAMPS defines it).
We have the hybrid encryption package ready. Composite signatures need
building. The key model adds one key pair (P-256 signing). Next experiment
should implement the switch.
