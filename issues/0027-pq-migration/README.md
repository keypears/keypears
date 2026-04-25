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

## Plan

1. Update the DB schema for PQ key sizes, delete existing data.
2. Replace key generation and signing with ML-DSA-65.
3. Replace message encryption with ML-KEM-768 via `@webbuf/aesgcm-mlkem`.
4. Update the federation API contract and all call sites.
5. Update the auth protocol for ML-DSA-65 signatures and POST callback.
6. Update `@keypears/client` for PQ verification.
7. Update docs and CLAUDE.md.

## Experiment 1: DB schema, key generation, and signing

### Goal

Replace the P-256 key pair model with dual ML-DSA-65 + ML-KEM-768 key pairs.
Update the database schema for the larger key sizes, replace key generation to
produce both PQ key pairs, and replace all signing with ML-DSA-65. After this
experiment, users can create accounts, log in, and sign PoW requests and auth
challenges using post-quantum cryptography.

### Database schema changes

**`user_keys` table:**

Currently stores one P-256 key pair per row:
- `publicKey` varchar(66) — 33-byte compressed P-256 public key, hex-encoded
- `encryptedPrivateKey` binary(256) — AES-GCM encrypted 32-byte private key

Replace with four columns for the two PQ key pairs:

```
signingPublicKey    varchar(3904)    -- ML-DSA-65 verifying key: 1,952 bytes hex
encryptedSigningKey varbinary(8192)  -- AES-GCM encrypted ML-DSA-65 signing key: 4,032 bytes + overhead
encapPublicKey      varchar(2368)    -- ML-KEM-768 encapsulation key: 1,184 bytes hex
encryptedDecapKey   varbinary(4096)  -- AES-GCM encrypted ML-KEM-768 decapsulation key: 2,400 bytes + overhead
```

Remove the old `publicKey` and `encryptedPrivateKey` columns.

**`messages` and `pending_deliveries` tables:**

- `senderPubKey` varchar(66) → varchar(3904) — stores ML-DSA-65 signing key
  (the sender proves identity via signature, so the signing key is what matters)
- `recipientPubKey` varchar(66) → varchar(2368) — stores ML-KEM-768 encap key
  (the recipient's encryption key, used to encapsulate the message key)

**`secret_versions` table (vault):**

- `publicKey` varchar(66) → varchar(2368) — stores ML-KEM-768 encap key (vault
  entries are encrypted to the user's own encap key)

After schema changes, clear all databases: `bun run db:clear && bun run db:push`.

### Key generation (`webapp/src/lib/auth.ts`)

Replace `generateAndEncryptKeyPairFromEncryptionKey`:

```typescript
// Current: generates one P-256 key pair
const privateKey = FixedBuf.fromRandom(32);
const publicKey = p256PublicKeyCreate(privateKey);

// New: generates ML-DSA-65 + ML-KEM-768 key pairs
import { mlDsa65KeyPair } from "@webbuf/mldsa";
import { mlKem768KeyPair } from "@webbuf/mlkem";

const { verifyingKey, signingKey } = mlDsa65KeyPair();
const { encapsulationKey, decapsulationKey } = mlKem768KeyPair();
```

Encrypt both private/secret keys with AES-GCM using the encryption key.
Return four values: `signingPublicKey`, `encryptedSigningKey`,
`encapPublicKey`, `encryptedDecapKey`.

Update `decryptPrivateKey` → `decryptSigningKey` and `decryptDecapKey` (or a
single function that returns both).

### Signing (`webapp/src/lib/auth.ts`)

Replace `signPowRequest`:

```typescript
// Current: P-256 ECDSA via Web Crypto
const jwk = p256PrivateKeyToJwk(privateKey);
const key = await crypto.subtle.importKey("jwk", jwk, ...);
const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, ...);

// New: ML-DSA-65 via @webbuf/mldsa
import { mlDsa65Sign } from "@webbuf/mldsa";
const signature = mlDsa65Sign(signingKey, message);
```

ML-DSA-65 signing is synchronous (WASM, not Web Crypto async), which simplifies
the code. The signature is a `FixedBuf<3309>` — hex-encode for transport.

### Auth signing (`webapp/src/routes/_app/_saved/sign.tsx`)

Replace `signPayload`:

```typescript
// Current: P-256 ECDSA → base64url
const sig = await crypto.subtle.sign(...);
return base64urlEncode(sig);

// New: ML-DSA-65 → base64url
const sig = mlDsa65Sign(signingKey, payloadBytes);
return base64urlEncode(sig.buf);
```

The `signPayload` function signature changes: it takes an ML-DSA-65 signing
key (`FixedBuf<4032>`) instead of a P-256 private key (`FixedBuf<32>`).

### Server-side verification (`webapp/src/server/api.router.ts`)

Replace P-256 ECDSA verification in `getPowChallengeEndpoint`:

```typescript
// Current: import p256 libs, verify via Web Crypto
const { p256PublicKeyToJwk, p256PublicKeyVerify } = await import("@webbuf/p256");
const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, ...);

// New: ML-DSA-65 verify via @webbuf/mldsa
import { mlDsa65Verify } from "@webbuf/mldsa";
const ok = mlDsa65Verify(verifyingKey, message, signature);
```

Again synchronous — no Web Crypto async needed.

### Server-side key storage (`webapp/src/server/user.server.ts`)

Update `insertKey` to store four values instead of two. Update `getActiveKey`
and `getRecentKeys` to return the new column names.

### Client-side key management

**`welcome.tsx`** — account creation calls the new key generation function.
Returns four values to `saveMyUser`.

**`keys.tsx`** — key rotation generates new dual key pairs. Re-encryption
decrypts and re-encrypts both private keys.

**`login.tsx`** — no key generation on login, just encryption key caching.
Unchanged.

### Server functions (`webapp/src/server/user.functions.ts`)

Update input validators for functions that accept keys:
- `saveMyUser` — now accepts `signingPublicKey`, `encryptedSigningKey`,
  `encapPublicKey`, `encryptedDecapKey`
- `rotateKey` — same four fields
- `createDomainUserFn` — same four fields
- `changeMyPassword` — re-encrypted keys have two encrypted fields each
- `reEncryptMyKey` — re-encrypts both keys for a given key ID
- `getMyKeys` — returns the new column names

### Dependencies

Add to `webapp/package.json`:
- `@webbuf/mldsa`
- `@webbuf/mlkem`

Remove:
- `@webbuf/p256` (after all P-256 usage is gone — may still be needed for
  message encryption until experiment 2)

### What this experiment does NOT change

- Message encryption (still P-256 ECDH — migrated in experiment 2)
- `@keypears/client` contract and auth verification (experiment 3)
- Documentation (experiment 4)

### Files to modify

1. `webapp/src/db/schema.ts` — new columns
2. `webapp/src/lib/auth.ts` — key gen, decrypt, sign
3. `webapp/src/server/user.server.ts` — key storage/retrieval
4. `webapp/src/server/user.functions.ts` — input validators, key operations
5. `webapp/src/server/api.router.ts` — signature verification
6. `webapp/src/routes/_app/welcome.tsx` — account creation
7. `webapp/src/routes/_app/_saved/_chrome/keys.tsx` — key management
8. `webapp/src/routes/_app/_saved/sign.tsx` — auth signing
9. `webapp/src/routes/_app/_saved/vault.$id.tsx` — key decryption for vault
10. `webapp/src/routes/_app/_saved/channel.$address.tsx` — key decryption for messaging
11. `webapp/src/routes/_app/_saved/_chrome/send.tsx` — PoW request signing
12. `webapp/src/lib/p256.test.ts` — delete or replace with ML-DSA tests
13. `webapp/package.json` — add `@webbuf/mldsa`, `@webbuf/mlkem`

### Testing

- `bun run db:clear && bun run db:push` — schema pushes cleanly
- `bun run typecheck` — zero type errors
- `bun run lint` — zero lint errors
- `bun run test` — tests pass (update/replace P-256 tests)
- Manual: create account, set password, log in, rotate key, re-encrypt key
- Manual: visit `/sign` page with test params, verify signing works

### Result: Pending
