+++
status = "open"
opened = "2026-04-26"
+++

# Update whitepaper and docs for hybrid crypto

## Goal

Update the whitepaper and all documentation to reflect the hybrid Curve25519 +
PQ cryptographic design from issue 0031. The whitepaper currently describes
pure ML-DSA-65/ML-KEM-768. The docs were updated in issue 0029 for pure PQ but
now need updating again for hybrid.

## What changed (issue 0031)

- **Two key pairs → four key pairs**: Ed25519 (classical signing), X25519
  (classical DH), ML-DSA-65 (PQ signing), ML-KEM-768 (PQ encryption)
- **Pure PQ signatures → composite**: Ed25519 + ML-DSA-65 via
  `@webbuf/sig-ed25519-mldsa` (3,374-byte composite signatures)
- **Pure PQ encryption → hybrid**: X25519 ECDH + ML-KEM-768 via
  `@webbuf/aesgcm-x25519dh-mlkem` (HKDF-SHA-256 combiner)
- **Key model**: persistent static-static X25519 DH keys alongside ML-KEM
- **Wire format**: messages carry `senderEd25519PubKey`, `senderX25519PubKey`,
  `recipientX25519PubKey` in addition to existing fields
- **Validation**: all four key types validated against active/federated keys

## Files to update

### Whitepaper (`whitepaper/keypears.typ`)

- Abstract: "ML-DSA-65 for signatures and ML-KEM-768 for key encapsulation"
  → add Ed25519 and X25519 as classical components
- Section 3 (Overview): message flow steps mention ML-DSA-65 signing and
  ML-KEM-768 encryption only — add hybrid/composite
- Section 4 (Identity): "two types of key pairs" → four key pairs
- Section 6 (Encryption): KEM formula uses only ML-KEM shared secret — add
  X25519 DH to the HKDF input. Message signing uses ML-DSA-65 only — add
  composite Ed25519 + ML-DSA-65.
- Section 8 (Third-Party Auth): signatures are composite now
- Section 9 (PoW): signing is composite now
- Section 10 (Security): add hybrid defense-in-depth rationale. Reference
  industry consensus (Signal, Chrome, OpenPGP, LAMPS drafts).
- Section 11 (Related Work): update Signal row — it uses X25519 + ML-KEM
  for KEM, same approach as us now. Add "Hybrid" row or update "Post-quantum"
  row.
- References: add OpenPGP PQC draft, LAMPS composite sigs/KEM drafts

### CLAUDE.md

- Tech stack: add Ed25519, X25519, composite signatures, hybrid encryption
- Auth architecture: four key pairs, composite signing
- Database schema: 8 key columns, 3 additional message columns

### Protocol docs (`webapp/src/docs/`)

- `protocol/encryption.md`: hybrid encryption, composite signatures
- `protocol/addressing.md`: four key pairs
- `protocol/proof-of-work.md`: composite signing for PoW challenges
- `security.md`: hybrid defense-in-depth
- `federation.md`: getPublicKey returns 4 public keys
- `welcome.md`: update crypto overview

## Plan

1. Update all documentation to reflect the hybrid crypto design.
