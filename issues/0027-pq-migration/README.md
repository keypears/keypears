+++
status = "open"
opened = "2026-04-25"
+++

# Replace all classical cryptography with post-quantum

## Goal

Replace every use of P-256 (ECDSA and ECDH) in KeyPears with post-quantum
algorithms. No hybrid scheme, no backwards compatibility — pure ML-DSA-65 for
signatures and ML-KEM-768 for key exchange. The current database will be deleted
(zero users), so there is no migration cost.

After this issue, KeyPears has no quantum-vulnerable cryptography. An attacker
with a cryptographically relevant quantum computer cannot forge signatures,
derive private keys from public keys, or decrypt messages.

## Background

See [issue 0026](../0026-post-quantum/README.md) for the full threat analysis.
The Google Quantum AI paper (Babbush et al., April 2026) demonstrates 256-bit
ECDLP can be broken with ~1,200 logical qubits in ~9 minutes.

### What's being replaced

| Current | Replacement | Package |
|---------|-------------|---------|
| P-256 ECDSA (signatures) | ML-DSA-65 (FIPS 204) | `@webbuf/mldsa` |
| P-256 ECDH (key exchange) | ML-KEM-768 (FIPS 203) | `@webbuf/aesgcm-mlkem` |
| P-256 key pairs (33-byte pub, 32-byte priv) | ML-DSA-65 (1,952-byte pub, 4,032-byte priv) + ML-KEM-768 (1,184-byte pub, 2,400-byte priv) | `@webbuf/mldsa`, `@webbuf/mlkem` |

### What stays the same

- AES-256-GCM (symmetric encryption) — quantum-safe
- SHA-256 / PBKDF2-HMAC-SHA-256 (hashing, KDF) — quantum-safe
- PoW (pow5-64b) — quantum-safe
- Three-tier key derivation (password → password key → encryption key + login key) — quantum-safe
- Session management (random tokens, SHA-256 hashed) — quantum-safe

### Size impact

Key and signature sizes increase dramatically:

| Field | P-256 | ML-DSA-65 | ML-KEM-768 |
|-------|-------|-----------|------------|
| Public key | 33 bytes | 1,952 bytes | 1,184 bytes |
| Private/secret key | 32 bytes | 4,032 bytes | 2,400 bytes |
| Signature | 64 bytes | 3,309 bytes | — |
| KEM ciphertext | — | — | 1,088 bytes |

This affects: DB schema (column widths), federation API responses, auth callback
(GET → POST), message wire format, vault entry encryption.

### Dual key pairs

Each user now needs two key pairs:

1. **ML-DSA-65** — for signing (auth, PoW request signing, message authentication)
2. **ML-KEM-768** — for encryption (message key exchange, vault entry encryption)

P-256 served both roles because ECDSA and ECDH use the same key pair. ML-DSA
and ML-KEM are fundamentally different algorithms with different key types.
A user's identity is now two public keys, not one.

## Code changes required

### 1. Database schema (`webapp/src/db/schema.ts`)

**`user_keys` table:**
- `publicKey` varchar(66) → needs to store both ML-DSA-65 public key (1,952
  bytes hex = 3,904 chars) and ML-KEM-768 encapsulation key (1,184 bytes hex =
  2,368 chars). Options:
  - Two columns: `signingPublicKey` and `encapPublicKey`
  - Or one large column with a structured format
- `encryptedPrivateKey` binary(256) → needs to fit both encrypted ML-DSA-65
  signing key (4,032 bytes + AES overhead) and ML-KEM-768 decapsulation key
  (2,400 bytes + AES overhead). Options:
  - Two columns: `encryptedSigningKey` and `encryptedDecapKey`
  - Or one large column

**`messages` table:**
- `senderPubKey` varchar(66) → varchar(3904) or larger (ML-DSA-65 signing key)
- `recipientPubKey` varchar(66) → varchar(2368) or larger (ML-KEM-768 encap key)
- `encryptedContent` → wire format changes (now includes KEM ciphertext)

**`pending_deliveries` table:**
- Same changes as messages.

**`secret_versions` table (vault):**
- `publicKey` varchar(66) → needs to store ML-KEM-768 encap key
- `encryptedData` → wire format changes

### 2. Key generation and storage (`webapp/src/lib/auth.ts`)

- Replace `generateAndEncryptKeyPairFromEncryptionKey` — generate ML-DSA-65
  key pair + ML-KEM-768 key pair, encrypt both private keys with AES-256-GCM
  using the encryption key.
- Replace `decryptPrivateKey` — decrypt both keys.
- Replace `signPowRequest` — sign with ML-DSA-65 instead of P-256 ECDSA via
  Web Crypto. Use `@webbuf/mldsa` `mlDsa65Sign`.
- Remove all `@webbuf/p256` imports.

### 3. Message encryption (`webapp/src/lib/message.ts`)

- Replace `computeMessageKey` (P-256 ECDH + SHA-256) with ML-KEM-768
  encapsulation via `@webbuf/aesgcm-mlkem`.
- Replace `encryptMessage` / `decryptMessage` to use `aesgcmMlkemEncrypt` /
  `aesgcmMlkemDecrypt`.
- The sender needs the recipient's ML-KEM encapsulation key (not their signing
  key).
- Add AAD with sender/recipient addresses for context binding.

### 4. Vault encryption (`webapp/src/lib/vault.ts`)

- Vault entries are encrypted with the user's own key. Replace ECDH self-
  encryption with ML-KEM self-encapsulation, or simpler: derive a vault
  encryption key from the encryption key directly (no asymmetric crypto needed
  for self-encryption).

### 5. Federation API (`webapp/src/server/api.router.ts`, `@keypears/client`)

- `getPublicKey` response needs to return both public keys (signing + encap).
  Update the oRPC contract in `@keypears/client`.
- Update all federation call sites that use public keys.
- Signature verification in `getPowChallenge` handler: replace P-256 ECDSA
  verify with ML-DSA-65 verify.

### 6. Auth protocol (`webapp/src/routes/_app/_saved/sign.tsx`, `@keypears/client`)

- `/sign` page: sign with ML-DSA-65 instead of P-256 ECDSA.
- `verifyCallback` in `@keypears/client`: verify ML-DSA-65 signatures instead
  of P-256. Replace `@webbuf/p256` with `@webbuf/mldsa`.
- **Auth callback must switch from GET to POST.** ML-DSA-65 signatures are
  3,309 bytes; base64url-encoded that's ~4,412 chars. Combined with other
  params, this exceeds safe URL length limits. The callback must submit a POST
  form instead of redirecting with query params.

### 7. Client package (`packages/client/`)

- Update `@keypears/client` contract: `getPublicKey` returns two keys.
- Update `verifyCallback`: ML-DSA-65 signature verification.
- Replace `@webbuf/p256` dependency with `@webbuf/mldsa`.
- Update `buildSignUrl` / callback handling for POST-based callback.

### 8. UI components

- Any component that displays public keys needs to handle larger values.
- Key management page (`keys.tsx`): shows two key types per key pair.
- Profile page (`$profile.tsx`): displays larger public keys.

### 9. Documentation and blog

- Update protocol docs (encryption.md, key-derivation.md, security.md,
  addressing.md, federation.md).
- CLAUDE.md tech stack and crypto sections.
- Consider a blog post announcing the migration.

### 10. RSS Anyway (`~/dev/rssanyway`)

- Update to handle POST-based auth callback instead of GET.
- Update `@keypears/client` dependency.

## Plan

1. Update the DB schema for PQ key sizes, delete existing data.
2. Replace key generation and signing with ML-DSA-65.
3. Replace message encryption with ML-KEM-768 via `@webbuf/aesgcm-mlkem`.
4. Update the federation API contract and all call sites.
5. Update the auth protocol for ML-DSA-65 signatures and POST callback.
6. Update `@keypears/client` for PQ verification.
7. Update docs, CLAUDE.md, and RSS Anyway.
