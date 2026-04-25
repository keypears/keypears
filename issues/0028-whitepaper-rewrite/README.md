+++
status = "open"
opened = "2026-04-25"
+++

# Rewrite the whitepaper for post-quantum KeyPears

## Goal

Rewrite the KeyPears whitepaper (`whitepaper/keypears.typ`) to reflect the
current post-quantum cryptographic design. The existing whitepaper describes
P-256 ECDSA/ECDH throughout — every cryptographic primitive, diagram, security
analysis, and performance claim is now wrong.

## Background

The whitepaper was written when KeyPears used NIST P-256 for all asymmetric
cryptography. Issue 0027 replaced everything with ML-DSA-65 (FIPS 204) for
signatures and ML-KEM-768 (FIPS 203) for key exchange via `@webbuf/aesgcm-mlkem`.
The whitepaper must be updated to describe the system as it actually works.

### What changed

- **Key pairs**: one P-256 key pair → two key pairs (ML-DSA-65 signing +
  ML-KEM-768 encryption)
- **Signatures**: P-256 ECDSA → ML-DSA-65 (hedged, with context separation)
- **Key exchange**: P-256 ECDH → ML-KEM-768 via `@webbuf/aesgcm-mlkem`
  (HKDF-SHA-256 key derivation, AES-256-GCM)
- **Message encryption**: ECDH shared secret → KEM encapsulation. Sender
  encrypts to both recipient and self. Messages are signed with a canonical
  length-prefixed envelope.
- **Vault encryption**: derived from encryption key, not from asymmetric
  private key
- **Auth protocol**: ML-DSA-65 signing, POST-based callback (signatures too
  large for URL query params)
- **Key sizes**: 33-byte pub keys → 1,952-byte signing + 1,184-byte encap.
  64-byte signatures → 3,309-byte signatures.

### What stayed the same

- AES-256-GCM symmetric encryption
- SHA-256 / HMAC-SHA-256 / PBKDF2-HMAC-SHA-256 key derivation
- Three-tier KDF (password → password key → encryption key + login key)
- Proof of work (pow5-64b, WebGPU)
- Federation model (keypears.json discovery, pull-based delivery)
- Address format (name@domain)
- Session management

### Sections of the whitepaper that need rewriting

The whitepaper is 677 lines of Typst. Key sections to update:

1. **Abstract** — references P-256, ECDSA, ECDH, Diffie-Hellman
2. **Section on cryptographic primitives** — all algorithm descriptions
3. **Key derivation diagrams** — show the new dual key pair model
4. **Key exchange / messaging section** — ECDH → KEM, add message signing
   and sender self-copy
5. **Security analysis** — update threat model for post-quantum, reference
   the Google Quantum AI paper (Babbush et al., 2026)
6. **Performance claims** — key sizes, signature sizes, computation times
   all changed dramatically
7. **Figures/diagrams** — any diagram showing P-256 key exchange

### Additional content to add

- **Post-quantum motivation**: why PQC now, the Google paper's resource
  estimates, the timeline argument
- **Third-party authentication**: the `/sign` protocol (issue 0025) is a
  significant new feature not in the original whitepaper
- **ML-DSA-65 and ML-KEM-768 descriptions**: brief explanation of lattice-based
  cryptography, NIST standardization, key/signature sizes
- **Message authentication**: the canonical signed envelope, why KEM requires
  explicit sender authentication (unlike ECDH where the shared secret
  implicitly authenticates both parties)

## Plan

1. Read the current whitepaper thoroughly, identify every P-256 reference.
2. Rewrite the whitepaper to describe the current system.
