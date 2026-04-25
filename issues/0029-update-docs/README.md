+++
status = "open"
opened = "2026-04-25"
+++

# Update documentation for post-quantum migration

## Goal

Update CLAUDE.md, protocol docs, and blog posts to reflect the post-quantum
migration (issue 0027). The whitepaper is already updated (issue 0028). The code
is fully migrated. The documentation is the last place P-256 references remain.

## Files with stale P-256 references

### CLAUDE.md (must update)

- Tech stack section references P-256, ECDSA, ECDH, `@webbuf/p256`
- Auth architecture section references P-256 key pairs
- Key management section references P-256
- Database schema section references old column names (`publicKey`,
  `encryptedPrivateKey`)
- Various other sections reference classical crypto

### Protocol docs (must update)

- `webapp/src/docs/protocol/key-derivation.md` — references P-256
- `webapp/src/docs/protocol/encryption.md` — describes ECDH, P-256
- `webapp/src/docs/protocol/addressing.md` — references P-256 key pairs
- `webapp/src/docs/protocol/proof-of-work.md` — references P-256 ECDSA signing
- `webapp/src/docs/security.md` — references P-256 throughout
- `webapp/src/docs/federation.md` — may reference P-256
- `webapp/src/docs/welcome.md` — may reference P-256

### Blog posts (DO NOT TOUCH)

Blog posts are historical documents. They describe what was true when they were
published. Do NOT modify them in any way — no notes, no rewrites, no edits.
They are permanently frozen.

## Plan

1. Update all documentation to reflect the current post-quantum system.

## Experiment 1: Update all documentation

### Goal

Update every document that references P-256/ECDSA/ECDH to reflect the current
ML-DSA-65 + ML-KEM-768 system. Add historical notes to blog posts. This is a
single experiment because the changes are mechanical — find P-256 references,
replace with correct PQ descriptions.

### CLAUDE.md changes

This is the most critical file — it's the AI agent onboarding guide. Major
sections to update:

- **Tech stack**: replace "P-256 key pairs, AES-256-GCM encryption, ECDH shared
  secrets (`@webbuf/*`)" with ML-DSA-65, ML-KEM-768, `@webbuf/mldsa`,
  `@webbuf/mlkem`, `@webbuf/aesgcm-mlkem`
- **Auth architecture**: replace "P-256 key pairs" with dual ML-DSA-65 +
  ML-KEM-768 key pairs throughout. Update the three-tier KDF description where
  it mentions encrypting P-256 private keys.
- **Key management**: replace P-256 key rotation description with dual key pair
  rotation
- **Database schema**: update column names from
  `publicKey`/`encryptedPrivateKey` to
  `signingPublicKey`/`encapPublicKey`/`encryptedSigningKey`/`encryptedDecapKey`.
  Update `secret_versions` from `publicKey` to `keyId`. Add
  `senderEncryptedContent` and `senderSignature` to messages/pending_deliveries.
- **Project structure**: update `packages/client/` description if needed
- Remove any remaining `@webbuf/p256` references

### Protocol docs changes

**`webapp/src/docs/protocol/key-derivation.md`**:

- Replace "P-256 private keys" with "ML-DSA signing keys and ML-KEM
  decapsulation keys"
- Update vault key derivation: HMAC of encryption key, not private key

**`webapp/src/docs/protocol/encryption.md`**:

- Replace ECDH description with ML-KEM-768 encapsulation via aesgcm-mlkem
- Add message signing (canonical envelope, ML-DSA-65)
- Add sender self-encryption for sent-message history
- Add AAD description

**`webapp/src/docs/protocol/addressing.md`**:

- Replace "P-256 key pair" with dual ML-DSA-65 + ML-KEM-768 key pairs
- Update key sizes

**`webapp/src/docs/protocol/proof-of-work.md`**:

- Replace "P-256 ECDSA" signing with ML-DSA-65

**`webapp/src/docs/security.md`**:

- Replace all P-256 references with PQ equivalents
- Add quantum resistance section
- Update client storage theft analysis for dual keys

**`webapp/src/docs/federation.md`**:

- Replace any P-256 references
- Update `getPublicKey` to mention dual keys

**`webapp/src/docs/welcome.md`**:

- Replace any P-256/ECDH references with PQ descriptions

### Files to modify (8 total)

1. `CLAUDE.md`
2. `webapp/src/docs/protocol/key-derivation.md`
3. `webapp/src/docs/protocol/encryption.md`
4. `webapp/src/docs/protocol/addressing.md`
5. `webapp/src/docs/protocol/proof-of-work.md`
6. `webapp/src/docs/security.md`
7. `webapp/src/docs/federation.md`
8. `webapp/src/docs/welcome.md`

### Verification

- `grep -r "P-256\|ECDSA\|ECDH\|p256\|Diffie-Hellman" CLAUDE.md webapp/src/docs/`
  returns zero matches (except historical context in blog note text)
- Blog posts have the historical note but content unchanged
- `bun run typecheck && bun run lint && bun run test` still pass

### Result: Pending
