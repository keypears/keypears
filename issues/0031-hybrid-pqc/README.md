+++
status = "open"
opened = "2026-04-26"
+++

# Switch to hybrid post-quantum cryptography

## Goal

Replace KeyPears' pure ML-DSA-65 / ML-KEM-768 cryptography with hybrid
composite constructions that combine classical and post-quantum algorithms.
Research which constructions are standardized or closest to standardization,
and adopt them.

## Background

### Why hybrid

KeyPears currently uses pure post-quantum cryptography — no classical
algorithms remain. This is a bet that ML-DSA and ML-KEM have no structural
flaws. The industry consensus is that this bet is premature:

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

- **Encryption**: classical key exchange (ECDH/X25519) AND ML-KEM-768 must
  both be broken to recover the message key.
- **Signatures**: classical signature (ECDSA/Ed25519) AND ML-DSA-65 must
  both be forged to impersonate a user.

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
4. Does the user need three key pairs (classical signing + PQ signing + PQ
   KEM) or can it be simplified?
5. What does `@webbuf/aesgcm-p256dh-mlkem` already handle correctly, and
   what needs changing?

### Key pair model

Currently each user has two key pairs:
- ML-DSA-65 (signing)
- ML-KEM-768 (encryption)

Hybrid would require adding classical key pairs:
- P-256 or Ed25519 (classical signing)
- P-256 or X25519 (classical key exchange) — unless `aesgcm-p256dh-mlkem`
  handles this at the message level without a persistent classical DH key

The `@webbuf/aesgcm-p256dh-mlkem` package uses ephemeral P-256 ECDH — the
sender generates a fresh P-256 key pair per message. The persistent key is
only the ML-KEM encap key. This may simplify the key model.

For composite signatures, the user would need a persistent classical signing
key alongside the ML-DSA-65 key. A composite signature = classical sig +
PQ sig concatenated.

## Plan

1. Research the exact constructions becoming standard for hybrid PQC —
   encryption and signatures. Determine which classical algorithms to use.
2. Implement hybrid encryption and composite signatures in KeyPears.
