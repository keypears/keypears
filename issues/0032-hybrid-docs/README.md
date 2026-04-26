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

1. Update the whitepaper for hybrid crypto.
2. Update CLAUDE.md and protocol docs.

## Experiment 1: Update the whitepaper

### Goal

Rewrite every cryptographic description in `whitepaper/keypears.typ` to reflect
the hybrid Curve25519 + PQ design. Must stay within 8 pages.

### Changes by section

**Abstract (line 47):**
- "post-quantum key pairs: ML-DSA-65 for signatures and ML-KEM-768 for key
  encapsulation" → "hybrid post-quantum key pairs: Ed25519 + ML-DSA-65 for
  composite signatures and X25519 + ML-KEM-768 for hybrid key encapsulation"

**Introduction (line 127-128):**
- "ML-KEM-768 for key encapsulation and ML-DSA-65 for digital signatures" →
  add Ed25519 and X25519 as classical components in the hybrid construction.
  Reference the industry consensus (Signal, Chrome, OpenPGP).

**Design Principles (line ~137):**
- "Post-quantum by default" → "Hybrid post-quantum by default. Classical
  (Ed25519, X25519) and post-quantum (ML-DSA-65, ML-KEM-768) algorithms are
  combined — both must be broken to compromise any operation."

**Overview (lines 217-232):**
- Step 1: "ML-KEM-768 encapsulation key and ML-DSA-65 signing key" → add
  "Ed25519 and X25519 public keys"
- Step 2: "signed with Alice's ML-DSA-65 signing key" → "signed with Alice's
  composite Ed25519 + ML-DSA-65 key"
- Step 4: "encapsulates a fresh shared secret to Bob's ML-KEM-768 key, derives
  an AES-256 key via HKDF-SHA-256" → "computes an X25519 DH shared secret and
  encapsulates to Bob's ML-KEM-768 key; both shared secrets are combined via
  HKDF-SHA-256"
- Step 4: "signs a canonical envelope...with ML-DSA-65" → "with composite
  Ed25519 + ML-DSA-65"
- Step 7: "verifies the ML-DSA-65 signature" → "verifies the composite
  signature"
- Step 8: "decapsulates the shared secret with his ML-KEM-768 decapsulation
  key" → "re-derives the X25519 DH shared secret and decapsulates ML-KEM-768;
  both are combined via HKDF-SHA-256"

**Identity and Addressing (lines 245-250):**
- "two types of key pairs" → "four types of key pairs"
- Add Ed25519 and X25519 descriptions with sizes (32 bytes each)
- Explain why four: "Ed25519 and ML-DSA-65 are independent signature schemes
  combined into a composite. X25519 and ML-KEM-768 are independent key
  exchange/encapsulation mechanisms combined in the hybrid encryption layer."

**Encryption (lines 353-380):**
- Message encryption formula: add X25519 shared secret to HKDF input:
  $K_"AES" = "HKDF-SHA-256"("salt" = 0^32, "IKM" = S_"X25519" || S_"ML-KEM",
  "info" = "webbuf:aesgcm-x25519dh-mlkem v1")$
- Message signing: "signs...with ML-DSA-65" → "signs...with composite
  Ed25519 + ML-DSA-65 (3,374 bytes: 1 version byte + 64 Ed25519 + 3,309
  ML-DSA-65)"
- Add note: "The hybrid construction ensures that an attacker must break both
  X25519 ECDH and ML-KEM-768 to recover the message key."

**Third-Party Authentication (line ~462-467):**
- "signs a canonical JSON payload with their ML-DSA-65 key" → "with their
  composite Ed25519 + ML-DSA-65 key"
- "ML-DSA-65 signatures are 3,309 bytes" → "composite signatures are 3,374
  bytes"
- "calling ML-DSA-65 verify" → "calling composite verify"

**Proof of Work (line ~491):**
- "sign with their ML-DSA-65 signing key" → "sign with their composite
  Ed25519 + ML-DSA-65 key"

**Security Analysis — Quantum Resistance (line ~513):**
- Add hybrid rationale: "KeyPears uses a hybrid construction combining
  classical (Ed25519, X25519) and post-quantum (ML-DSA-65, ML-KEM-768)
  algorithms. An attacker must break both to compromise any operation. This
  provides defense-in-depth: if a structural flaw is discovered in
  lattice-based cryptography, the classical algorithms still protect; if a
  cryptographically relevant quantum computer arrives, the post-quantum
  algorithms still protect."
- Remove or soften the "no classical elliptic-curve algorithms remain"
  language

**Security Analysis — Limitations (line ~547):**
- Update the lattice-only risk: "ML-DSA and ML-KEM are paired with Ed25519 and
  X25519 respectively. A structural break against Module-LWE would require also
  breaking the classical algorithms to compromise the system."

**Related Work table:**
- Update Post-quantum row for KeyPears: "Full (hybrid KEM+sig)" instead of
  "Full (KEM+sig)"
- Signal comparison: both now use hybrid KEM. Signal still lacks PQ signatures.

**Conclusion:**
- "post-quantum key encapsulation, message signing" → "hybrid post-quantum key
  encapsulation and composite signing"

### References to add

- IETF OpenPGP PQC draft: `draft-ietf-openpgp-pqc`
- IETF LAMPS Composite Signatures: `draft-ietf-lamps-pq-composite-sigs`

### Constraint

Must stay within 8 pages. The hybrid descriptions are slightly longer but the
key sizes are mostly the same (Ed25519/X25519 are 32 bytes — the PQ keys
dominate). Keep the text tight.

### Result: Pass

Whitepaper fully rewritten for hybrid Curve25519 + PQ. Every section updated:
abstract, intro, design principles, overview, identity (four key pairs),
encryption (HKDF formula with both shared secrets), signing (composite 3,374
bytes), auth, PoW, security (hybrid defense-in-depth), related work, conclusion.
Added OpenPGP PQC draft reference. Fixed erroneous FIPS 203 citation next to
X25519 per Codex review. 8 pages, 8 references.

## Experiment 2: Update CLAUDE.md and protocol docs

### Goal

Update CLAUDE.md and all webapp protocol docs to reflect the hybrid Curve25519
+ PQ design. The whitepaper is done (experiment 1). These are the remaining
stale files.

### CLAUDE.md changes

- **Tech stack crypto line**: currently says "ML-DSA-65 signatures, ML-KEM-768
  key encapsulation" — add Ed25519, X25519, composite signatures, hybrid
  encryption, and the new packages (`@webbuf/sig-ed25519-mldsa`,
  `@webbuf/aesgcm-x25519dh-mlkem`, `@webbuf/ed25519`, `@webbuf/x25519`)
- **Auth architecture**: "ML-DSA-65 + ML-KEM-768 key pairs" → four key pairs
  (Ed25519, X25519, ML-DSA-65, ML-KEM-768). Update encryption key description
  to mention all four private keys.
- **Key management**: update for four key pairs rotated atomically
- **Database schema**: `user_keys` has 8 key columns. Messages have 3
  additional columns (senderEd25519PubKey, senderX25519PubKey,
  recipientX25519PubKey).
- **PoW section**: composite signing for challenges

### Protocol docs changes

**`webapp/src/docs/protocol/encryption.md`**:
- Hybrid encryption: X25519 DH + ML-KEM-768 via HKDF-SHA-256
- Composite signatures: Ed25519 + ML-DSA-65 (3,374 bytes)

**`webapp/src/docs/protocol/addressing.md`**:
- Four key pairs per user

**`webapp/src/docs/protocol/key-derivation.md`**:
- Encryption key encrypts all four private keys

**`webapp/src/docs/protocol/proof-of-work.md`**:
- Composite signing for PoW challenges

**`webapp/src/docs/security.md`**:
- Hybrid defense-in-depth rationale
- Client storage theft: four private keys

**`webapp/src/docs/federation.md`**:
- getPublicKey returns four public keys

**`webapp/src/docs/welcome.md`**:
- Update crypto overview for hybrid

### Files to modify (8 total)

1. `CLAUDE.md`
2. `webapp/src/docs/protocol/encryption.md`
3. `webapp/src/docs/protocol/addressing.md`
4. `webapp/src/docs/protocol/key-derivation.md`
5. `webapp/src/docs/protocol/proof-of-work.md`
6. `webapp/src/docs/security.md`
7. `webapp/src/docs/federation.md`
8. `webapp/src/docs/welcome.md`

### Verification

- `grep -rn "pure.*PQ\|pure.*post-quantum\|two.*key pairs\|ML-DSA-65 signing key pair\|ML-KEM-768 encapsulation key pair" CLAUDE.md webapp/src/docs/` — zero matches for stale pure-PQ language
- No code changes — docs only

### Result: Pending
