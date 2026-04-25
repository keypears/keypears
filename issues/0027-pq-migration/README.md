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
- `senderPubKey` varchar(66) → varchar(3904) (ML-DSA-65 signing key)
- `recipientPubKey` varchar(66) → varchar(2368) (ML-KEM-768 encap key)
- Add `senderSignature` mediumblob — ML-DSA-65 signature over the canonical
  message envelope (see section 3 for signed bytes specification)
- `encryptedContent` → wire format changes (now includes KEM ciphertext from
  `@webbuf/aesgcm-mlkem`)
- Add `senderEncryptedContent` mediumblob — message encrypted to the sender's
  own encap key, so the sender can decrypt their sent history

**`pending_deliveries` table:**
- Same changes as messages (add `senderSignature`, widen pub key columns).

**`secret_versions` table (vault):**
- `publicKey` varchar(66) → replace with `keyId` binaryId — references the
  `user_keys` row that was used to derive the vault key. The vault key is now
  derived from the cached encryption key (see section 4), so the full public
  key is not needed — only the key ID to track which password/key pair
  encrypted the entry.
- `encryptedData` → no wire format change (still AES-GCM, key derivation
  changes but the ciphertext format doesn't)

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
- **Sender must sign each message with ML-DSA-65.** ML-KEM encryption alone
  does not authenticate the sender — anyone with the recipient's public encap
  key can encapsulate. Add a `senderSignature` field to the message schema.
  The recipient verifies the signature against the sender's signing key before
  trusting the message content. The signed bytes are a canonical envelope:
  ```
  senderAddress || "\0" || recipientAddress || "\0" ||
  senderSigningPubKey || recipientEncapPubKey ||
  kemCiphertext || encryptedContent
  ```
  This binds the signature to the full message context — sender identity,
  recipient identity, both public keys, the KEM ciphertext, and the encrypted
  content. Prevents replay (wrong recipient), substitution (swapped
  ciphertext), and impersonation (wrong sender key).
- **Sent-message decryptability.** With ECDH, both parties derive the same
  shared secret, so the sender can decrypt their own sent messages. With KEM,
  only the recipient can decapsulate. Solution: the sender must also encrypt
  the message to themselves (encapsulate to their own encap key) and store a
  second KEM ciphertext. The message schema needs either a
  `senderEncryptedContent` column or the sender stores a copy in their own
  channel using their own encap key.
- The current UI determines message direction via
  `keyMap.has(msg.senderPubKey)` — check which pub key matches the user's key
  map. With separate signing/encap keys, this logic needs updating.

### 4. Vault encryption (`webapp/src/lib/vault.ts`)

- Current implementation uses `HMAC(privateKey, "vault-key")` to derive a
  symmetric vault key, then AES-GCM encrypts with that key. It does NOT use
  ECDH self-encryption.
- The private key used is the P-256 private key (32 bytes). With PQ, we have
  two private keys (ML-DSA signing key and ML-KEM decap key). The vault key
  should derive from the ML-KEM decapsulation key or from the encryption key
  directly.
- Simpler approach: derive the vault key from the cached encryption key
  (the PBKDF2-derived key from the password) instead of from an asymmetric
  private key. This removes the asymmetric dependency entirely for vault
  encryption, which is always self-encryption.
- The `secret_versions.publicKey` column currently identifies which P-256 key
  was used to encrypt each entry (so the UI knows which private key to try for
  decryption). With the new model, this should identify the key pair (by key
  number or key ID) rather than storing the full public key.

### 5. Federation API (`webapp/src/server/api.router.ts`, `@keypears/client`)

- `getPublicKey` response needs to return both public keys with explicit roles:
  `signingPublicKey` (ML-DSA-65 verifying key) and `encapPublicKey` (ML-KEM-768
  encapsulation key). Update the oRPC contract in `@keypears/client`.
- Call sites must use the correct key for the correct purpose:
  - Auth and PoW verification → `signingPublicKey`
  - Message encryption → `encapPublicKey`
  - Misusing these (e.g. trying to encrypt with a signing key) is a type error
    because they have different sizes.
- Signature verification in `getPowChallenge` handler: replace P-256 ECDSA
  verify with ML-DSA-65 verify.
- Update `webapp/src/server/message.functions.ts` — message sending uses
  public keys from federation.
- Update `webapp/src/server/federation.server.ts` — remote public key lookup.
- Update validators in `webapp/src/server/vault.functions.ts` that reference
  key lengths.

### 6. Auth protocol (`webapp/src/routes/_app/_saved/sign.tsx`, `@keypears/client`)

- `/sign` page: sign with ML-DSA-65 instead of P-256 ECDSA.
- `verifyCallback` in `@keypears/client`: verify ML-DSA-65 signatures instead
  of P-256. Replace `@webbuf/p256` with `@webbuf/mldsa`.
- **Auth callback must switch from GET to POST.** ML-DSA-65 signatures are
  3,309 bytes; base64url-encoded that's ~4,412 chars. Combined with other
  params, this exceeds safe URL length limits. The `/sign` page must submit
  a hidden HTML form via POST instead of `window.location.href` redirect.
  The form fields are the same as the current query params: `signature`,
  `address`, `nonce`, `timestamp`, `expires`, `data`, `state`.
- The deny flow can remain GET (only sends `error` and `state`, which are
  small).

### 7. Client package (`packages/client/`)

- Update `@keypears/client` contract: `getPublicKey` returns
  `{ signingPublicKey: string | null, encapPublicKey: string | null }`.
- Update `verifyCallback`: ML-DSA-65 signature verification via
  `@webbuf/mldsa` `mlDsa65Verify`. Replace `@webbuf/p256` dependency.
- Update `verifyCallback` to accept POST body params (currently only accepts
  `URLSearchParams` or `Record<string, string>` — this still works if the
  consuming app parses the POST body into one of those formats, but the
  docs and type signature should make this explicit).
- `buildSignUrl` remains unchanged (the initial redirect TO the `/sign` page
  is still GET with small params).

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

**Deferred to a later experiment.** The `/sign` page and `@keypears/client`'s
`verifyCallback` must be migrated together — switching one without the other
breaks third-party sign-in. This experiment only changes PoW request signing
(`signPowRequest` in `auth.ts`), not auth challenge signing.

### Server-side PoW verification (`webapp/src/server/api.router.ts`)

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
- `@webbuf/mldsa` (this experiment)
- `@webbuf/mlkem` (this experiment)
- `@webbuf/aesgcm-mlkem` (message encryption experiment)

Remove:
- `@webbuf/p256` (after all P-256 usage is gone — `/sign` page and message
  encryption still use it until their respective experiments)

### What this experiment does NOT change

- Message encryption (still P-256 ECDH — migrated in a later experiment)
- Auth `/sign` page signing and `@keypears/client` verification — these must
  be migrated together in one experiment so the signer and verifier both
  switch to ML-DSA-65 at the same time. Switching `/sign` to ML-DSA while
  `verifyCallback` still expects P-256 would break all third-party sign-in.
- Documentation

### Files to modify

1. `webapp/src/db/schema.ts` — new columns, wider varchar/varbinary
2. `webapp/src/lib/auth.ts` — key gen, decrypt, sign (PoW signing only)
3. `webapp/src/server/user.server.ts` — key storage/retrieval
4. `webapp/src/server/user.functions.ts` — input validators, key operations
5. `webapp/src/server/api.router.ts` — PoW signature verification
6. `webapp/src/server/message.functions.ts` — public key references
7. `webapp/src/server/vault.functions.ts` — key length validators
8. `webapp/src/server/federation.server.ts` — remote public key lookup
9. `webapp/src/routes/_app/welcome.tsx` — account creation
10. `webapp/src/routes/_app/_saved/_chrome/keys.tsx` — key management
11. `webapp/src/routes/_app/_saved/vault.$id.tsx` — key decryption for vault
12. `webapp/src/routes/_app/_saved/channel.$address.tsx` — key decryption
13. `webapp/src/routes/_app/_saved/_chrome/send.tsx` — PoW request signing
14. `webapp/src/lib/p256.test.ts` — delete or replace with ML-DSA tests
15. `webapp/package.json` — add `@webbuf/mldsa`, `@webbuf/mlkem`
16. `packages/client/src/contract.ts` — update `getPublicKey` output schema

### Testing

- `bun run db:clear && bun run db:push` — schema pushes cleanly
- `bun run typecheck` — zero type errors
- `bun run lint` — zero lint errors
- `bun run test` — tests pass (update/replace P-256 tests)
- Manual: create account, set password, log in, rotate key, re-encrypt key
- Manual: visit `/sign` page with test params, verify signing works

### Result: Pending
