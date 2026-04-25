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

1. Rewrite the whitepaper to describe the current post-quantum system.

## Experiment 1: Rewrite the whitepaper

### Goal

Rewrite `whitepaper/keypears.typ` to accurately describe KeyPears as it exists
today — a post-quantum federated protocol using ML-DSA-65 and ML-KEM-768. The
whitepaper is the protocol's permanent record. It must be correct.

### P-256 references to replace (16 locations)

1. **Abstract (line 47)**: "NIST P-256 key pairs" → ML-DSA-65 + ML-KEM-768
2. **Abstract (line 50-52)**: "Diffie-Hellman key exchange" and "P-256
   ECDSA/ECDH" → KEM-based key exchange + ML-DSA signatures
3. **Introduction (line 118)**: "Diffie-Hellman key exchange" → post-quantum
   key encapsulation
4. **Overview step 4 (line 184)**: "ECDH + encrypt" → "KEM + encrypt + sign"
5. **Overview step 5 (line 211)**: "signed with Alice's P-256 private key" →
   ML-DSA-65
6. **Overview steps 13-14 (lines 213-215)**: ECDH shared secret description →
   ML-KEM encapsulation
7. **Overview step 22 (line 221-222)**: "re-derives the ECDH shared secret" →
   decapsulates with own ML-KEM key
8. **Identity section (line 235)**: "NIST P-256 key pairs" and "ECDH key
   agreement" → dual key pairs (ML-DSA-65 + ML-KEM-768)
9. **Key derivation (line 323)**: "encrypt and decrypt P-256 private keys" →
   encrypt and decrypt ML-DSA signing keys and ML-KEM decapsulation keys
10. **Vault key (lines 342-345)**: HMAC of private key → HMAC of encryption key
11. **Encryption section (lines 354-366)**: entire ECDH + SHA-256 description →
    ML-KEM encapsulation via aesgcm-mlkem + HKDF-SHA-256
12. **Vault encryption (lines 368-372)**: "derived from the user's private key"
    → derived from the user's encryption key
13. **PoW section (lines 488-489)**: "sign with their P-256 private key
    (ECDSA)" → sign with ML-DSA-65
14. **Social-graph probing (lines 547-548)**: "sign the request with their P-256
    private key" → ML-DSA-65
15. **Client storage theft (line 565)**: "decrypt the user's P-256 private keys"
    → decrypt the user's ML-DSA signing keys and ML-KEM decapsulation keys
16. **Conclusion (line 672)**: "Diffie-Hellman key exchange" → post-quantum
    key encapsulation

### New content to add

**Post-quantum motivation (new section after Introduction, before Design
Principles):**
- The quantum threat: Shor's algorithm breaks ECDLP
- Google Quantum AI paper (Babbush et al., April 2026): ~1,200 logical qubits,
  ~9 minutes on 500K physical qubits — 20× reduction from prior estimates
- NIST PQC standardization: ML-KEM (FIPS 203), ML-DSA (FIPS 204), SLH-DSA
  (FIPS 205) finalized August 2024
- KeyPears' approach: pure PQ, no hybrid, no backwards compatibility
- What stays quantum-safe: AES-256-GCM, SHA-256, PBKDF2, PoW

**Dual key pairs (update Identity section):**
- Each user has two key pairs: ML-DSA-65 for signing, ML-KEM-768 for encryption
- Why two: ML-DSA is a signature scheme, ML-KEM is a KEM — they can't
  substitute for each other (unlike P-256 which served both roles)
- Key sizes: signing pub 1,952 bytes, encap pub 1,184 bytes

**Message encryption rewrite (update Encryption section):**
- KEM-based: sender encapsulates to recipient's ML-KEM key, derives AES key
  via HKDF-SHA-256
- Sender self-encryption: encrypts a second copy to own ML-KEM key for sent
  history (KEM doesn't allow bilateral derivation like ECDH)
- Message signing: sender signs a canonical length-prefixed envelope covering
  addresses, public keys, and both ciphertexts with ML-DSA-65
- AAD: sender/recipient addresses bound into AES-GCM authentication tag

**Third-party authentication (new section before or after Federation):**
- The `/sign` protocol: domain discovery → redirect → structured signing →
  POST callback → signature verification
- No API keys, no client registration (unlike OAuth)
- Domain-only input for privacy
- Structured typed payloads prevent cross-context signature reuse

**Updated Related Work table:**
- Add "Post-quantum" row: PGP No, Signal Partial (KEM only), Matrix No,
  KeyPears Yes

**Updated security analysis:**
- Remove P-256 references
- Add quantum resistance analysis
- Note that ML-DSA-65 signing explicitly authenticates the sender (unlike ECDH
  where the shared secret implicitly authenticates both parties)

**Updated Limitations:**
- ML-DSA/ML-KEM are lattice-based; a structural break against Module-LWE would
  compromise both. SLH-DSA (hash-based) exists as a fallback but is not
  currently used.
- Key and signature sizes are substantially larger than classical equivalents
- No independent audit of any PQC implementation exists yet

**Updated Future Work:**
- Keep: group messaging, transparency logs, mobile client
- Add: SLH-DSA fallback support, hybrid classical+PQ option for
  backwards-compatible deployments, per-app identity creation via the /sign
  page

### Structural changes

The whitepaper is currently ~8 pages. The rewrite will likely grow to ~10-12
pages due to the new sections (post-quantum motivation, third-party auth,
expanded message encryption). Keep the same Typst formatting and figure style.

Update the references.yml to add:
- Babbush et al. 2026 (Google Quantum AI paper)
- FIPS 203 (ML-KEM)
- FIPS 204 (ML-DSA)
- Signal PQXDH blog post

### Result: Pending
