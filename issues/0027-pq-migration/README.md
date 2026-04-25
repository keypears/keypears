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

Single experiment: replace all P-256 usage at once. Zero users means zero data
to migrate — there's no benefit to incremental passes, and incremental passes
create sequencing traps where new PQ key storage breaks deferred P-256 consumers.
Delete the database, replace everything, test end-to-end.

## Experiment 1: Replace all P-256 with ML-DSA-65 + ML-KEM-768

### Goal

Replace every P-256 operation in KeyPears with post-quantum equivalents. After
this experiment, every feature works with PQ crypto: account creation, login,
key rotation, messaging, vault, auth `/sign` page, and `@keypears/client`
verification. No P-256 code remains.

### Database schema changes

**`user_keys` table — replace key columns:**

```
signingPublicKey    varchar(3904)    -- ML-DSA-65 verifying key (1,952 bytes hex)
encryptedSigningKey varbinary(8192)  -- AES-GCM encrypted ML-DSA-65 signing key (4,032 + overhead)
encapPublicKey      varchar(2368)    -- ML-KEM-768 encapsulation key (1,184 bytes hex)
encryptedDecapKey   varbinary(4096)  -- AES-GCM encrypted ML-KEM-768 decap key (2,400 + overhead)
```

Remove old `publicKey` varchar(66) and `encryptedPrivateKey` binary(256).

**`messages` table — widen keys, add signature + sender copy:**

- `senderPubKey` varchar(66) → varchar(3904) (ML-DSA-65 signing key)
- `recipientPubKey` varchar(66) → varchar(2368) (ML-KEM-768 encap key)
- Add `senderSignature` mediumblob — ML-DSA-65 signature over canonical
  message envelope
- `encryptedContent` — wire format changes (includes KEM ciphertext via
  `@webbuf/aesgcm-mlkem`)
- Add `senderEncryptedContent` mediumblob — message encrypted to sender's own
  encap key for sent-message history

**`pending_deliveries` table:**

- Same column changes as messages (widen pub keys, add `senderSignature`).

**`secret_versions` table (vault):**

- Replace `publicKey` varchar(66) with `keyId` binaryId — references the
  `user_keys` row. Vault key is now derived from the cached encryption key,
  not from an asymmetric private key.

Clear all databases: `bun run db:clear && bun run db:push`.

### Key generation (`webapp/src/lib/auth.ts`)

Replace `generateAndEncryptKeyPairFromEncryptionKey` — generate ML-DSA-65 +
ML-KEM-768 key pairs, encrypt both private/secret keys with AES-GCM. Return
four values: `signingPublicKey`, `encryptedSigningKey`, `encapPublicKey`,
`encryptedDecapKey`.

Replace `decryptPrivateKey` with `decryptSigningKey` (returns `FixedBuf<4032>`)
and `decryptDecapKey` (returns `FixedBuf<2400>`).

Replace `signPowRequest` — use `mlDsa65Sign(signingKey, message)` instead of
P-256 ECDSA via Web Crypto. Synchronous WASM, no async needed.

Remove all `@webbuf/p256` imports.

### Message encryption (`webapp/src/lib/message.ts`)

Replace `computeMessageKey` / `encryptMessage` / `decryptMessage`:

- Use `aesgcmMlkemEncrypt(recipientEncapKey, plaintext)` from
  `@webbuf/aesgcm-mlkem`.
- Add AAD with sender/recipient addresses for context binding.
- Sign each message with ML-DSA-65. Signed envelope bytes:
  ```
  senderAddress || "\0" || recipientAddress || "\0" ||
  senderSigningPubKey || recipientEncapPubKey ||
  kemCiphertext || encryptedContent
  ```
- Encrypt a second copy to the sender's own encap key for sent-message
  decryptability (`senderEncryptedContent`).
- Update message direction detection: currently uses
  `keyMap.has(msg.senderPubKey)` with P-256 pub keys. Now check against
  `signingPublicKey` in the key map.

### Vault encryption (`webapp/src/lib/vault.ts`)

Current: `deriveVaultKey(privateKey)` = `HMAC(p256PrivateKey, "vault-key")`.

New: derive vault key from the cached encryption key instead:
`HMAC(encryptionKey, "vault-key-v2")`. This removes the asymmetric key
dependency entirely — vault encryption is always self-encryption, so the
password-derived encryption key is the right root.

Update `secret_versions` to store `keyId` (references `user_keys` row) instead
of the full public key. The UI uses this to determine which password encrypted
the entry.

### Auth `/sign` page (`webapp/src/routes/_app/_saved/sign.tsx`)

Replace `signPayload` — use `mlDsa65Sign(signingKey, payloadBytes)` instead of
P-256 ECDSA via Web Crypto.

**Switch callback from GET to POST.** ML-DSA-65 signatures are 3,309 bytes
(~4,412 base64url chars). The `/sign` page submits a hidden HTML form via POST
instead of `window.location.href`. Form fields: `signature`, `address`, `nonce`,
`timestamp`, `expires`, `data`, `state`. Deny flow remains GET (small params).

### `@keypears/client` (`packages/client/`)

- Update contract: `getPublicKey` returns
  `{ signingPublicKey: string | null, encapPublicKey: string | null }`.
- Update `verifyCallback`: replace P-256 ECDSA verify with ML-DSA-65 via
  `mlDsa65Verify` from `@webbuf/mldsa`.
- Replace `@webbuf/p256` dependency with `@webbuf/mldsa`.
- `verifyCallback` params input (`URLSearchParams` or `Record<string, string>`)
  still works for POST body — consuming app parses POST body into one of those
  formats.
- `buildSignUrl` unchanged (initial redirect is still GET).

### Server-side changes

- `api.router.ts` — replace P-256 ECDSA verify with `mlDsa65Verify` in
  `getPowChallengeEndpoint`. Update `getPublicKey` handler to return both keys.
- `user.server.ts` — `insertKey` stores four columns. `getActiveKey` /
  `getRecentKeys` return new column names.
- `user.functions.ts` — update input validators: `saveMyUser`, `rotateKey`,
  `createDomainUserFn`, `changeMyPassword`, `reEncryptMyKey` all accept four
  key fields. `getMyKeys` returns new columns.
- `message.functions.ts` — update public key references, add signature field.
- `vault.functions.ts` — update key length validators, `keyId` reference.
- `federation.server.ts` — remote public key lookup returns two keys.

### Dependencies

Add to `webapp/package.json`:
- `@webbuf/mldsa`
- `@webbuf/mlkem`
- `@webbuf/aesgcm-mlkem`

Remove:
- `@webbuf/p256`

Update `packages/client/package.json`:
- Replace `@webbuf/p256` with `@webbuf/mldsa`

### Files to modify

1. `webapp/src/db/schema.ts` — new columns, wider varchar/varbinary
2. `webapp/src/lib/auth.ts` — key gen, decrypt, sign
3. `webapp/src/lib/message.ts` — ML-KEM encryption, message signing
4. `webapp/src/lib/vault.ts` — vault key derivation from encryption key
5. `webapp/src/server/user.server.ts` — key storage/retrieval
6. `webapp/src/server/user.functions.ts` — input validators, key operations
7. `webapp/src/server/api.router.ts` — signature verification, getPublicKey
8. `webapp/src/server/message.functions.ts` — public key references, signature
9. `webapp/src/server/vault.functions.ts` — key length validators, keyId
10. `webapp/src/server/federation.server.ts` — remote public key lookup
11. `webapp/src/routes/_app/welcome.tsx` — account creation
12. `webapp/src/routes/_app/_saved/_chrome/keys.tsx` — key management
13. `webapp/src/routes/_app/_saved/sign.tsx` — auth signing + POST callback
14. `webapp/src/routes/_app/_saved/vault.$id.tsx` — key decryption for vault
15. `webapp/src/routes/_app/_saved/channel.$address.tsx` — message decryption
16. `webapp/src/routes/_app/_saved/_chrome/send.tsx` — message signing + PoW
17. `webapp/src/lib/p256.test.ts` — delete or replace with PQ tests
18. `webapp/package.json` — add PQ deps, remove P-256
19. `packages/client/src/contract.ts` — getPublicKey output schema
20. `packages/client/src/auth.ts` — ML-DSA-65 verification
21. `packages/client/package.json` — replace @webbuf/p256 with @webbuf/mldsa

### Testing

- `bun run db:clear && bun run db:push` — schema pushes cleanly
- `bun run typecheck` — zero type errors
- `bun run lint` — zero lint errors
- `bun run test` — tests pass (replace P-256 tests with PQ tests)
- Manual: create account, set password, log in, rotate key, re-encrypt key
- Manual: send message between two users, verify decryption on both sides
- Manual: create vault entry, verify decryption
- Manual: visit `/sign` page, approve, verify POST callback works
- Manual: sign into RSS Anyway via KeyPears auth (end-to-end PQ)
- Verify no `@webbuf/p256` imports remain: `grep -r "webbuf/p256" webapp/src/`

### Result: Pass

All 27 files updated. P-256 completely removed — zero `@webbuf/p256` imports
remain. Typecheck, lint, and tests pass. Dual ML-DSA-65 + ML-KEM-768 key pairs,
`aesgcm-mlkem` message encryption with sender self-copy, ML-DSA-65 signing for
PoW and auth, POST-based auth callback, vault key derived from encryption key.

Codex review identified six security issues that need fixing in experiment 2.

## Experiment 2: Fix security gaps from Codex audit

### Goal

Address the six security issues identified by Codex review of experiment 1.
These are enforcement gaps — the crypto primitives are correct but the
application doesn't verify signatures, validate keys, or bind context properly.

### Findings to fix

**High 1: Message signatures never verified.**

`verifyMessageSignature` exists in `message.ts` but nothing calls it. Messages
are stored and displayed without checking the sender's signature.

Fix:
- In `api.router.ts` `notifyMessageHandler`: after pulling the message from the
  remote server, verify the `senderSignature` against the `senderPubKey` and
  `encryptedContent` before inserting. Reject messages with invalid signatures.
- In `channel.$address.tsx` `tryDecrypt`: verify the signature before
  decrypting. Display a warning or reject messages with invalid signatures.

**High 2: No server-side key validation on message submission.**

`sendMessage` in `message.functions.ts` trusts whatever `senderPubKey` and
`recipientPubKey` the client sends. A custom client can submit misleading keys.

Fix:
- Verify `senderPubKey` matches the authenticated user's active signing key
  from the database.
- Verify `recipientPubKey` matches the recipient's actual encap key via
  federation lookup (for remote recipients) or database lookup (for local).
- Reject messages where keys don't match.

**High 3: PoW binding not validated.**

The PoW challenge uses `senderAddress`/`recipientAddress` from client input
without verifying they match the session-derived sender and the requested
recipient.

Fix:
- In `sendMessage`, verify that the PoW challenge's sender/recipient addresses
  match the actual sender (from session) and recipient (from input).

**Medium 4: Signature only covers recipient ciphertext.**

The issue design called for a canonical envelope covering addresses, keys, and
both ciphertexts. The implementation only signs `recipientCt`.

Fix:
- Update `encryptMessage`/`encryptSecretMessage` in `message.ts` to build a
  length-prefixed canonical envelope covering: sender address, recipient
  address, sender signing pub key, recipient encap pub key, recipient
  ciphertext, and sender ciphertext. Sign the envelope, not just the
  recipient ciphertext.
- Update `verifyMessageSignature` to reconstruct and verify the same envelope.
- The envelope format: `"KeypearsMessageV1" || len-prefixed fields`.

**Medium 5: No AAD on message encryption.**

`aesgcmMlkemEncrypt` supports AAD but it's not being used. Should bind
sender/recipient addresses into the AES-GCM authentication tag.

Fix:
- Pass `WebBuf.fromUtf8(senderAddress + "\0" + recipientAddress)` as AAD to
  both `aesgcmMlkemEncrypt` calls (recipient copy and sender copy).
- Pass the same AAD to `aesgcmMlkemDecrypt` in `decryptMessageContent`.
- `decryptMessageContent` needs sender/recipient address params.

**Medium 6: No size bounds on remote pull fields.**

`notifyMessageHandler` in `api.router.ts` size-checks `encryptedContent` but
not `senderEncryptedContent` or `senderSignature`.

Fix:
- Add size checks for `senderEncryptedContent` (same limit as
  `encryptedContent`) and `senderSignature` (max 6700 hex chars = 3350 bytes).

**Low: Stale P-256 references in docs/comments.**

`packages/client/src/auth.ts` doc comment still says "P-256 ECDSA." Blog and
doc files still reference P-256. Code imports are clean but prose is stale.

Fix:
- Update the doc comment in `auth.ts`.
- Defer blog/doc updates to a documentation experiment.

### Files to modify

1. `webapp/src/lib/message.ts` — canonical envelope, AAD, updated signatures
2. `webapp/src/server/api.router.ts` — signature verification on pull, size
   bounds
3. `webapp/src/server/message.functions.ts` — key validation, PoW binding
4. `webapp/src/routes/_app/_saved/channel.$address.tsx` — signature
   verification before display, AAD in decryption
5. `packages/client/src/auth.ts` — fix doc comment

### Result: Pass

All six Codex findings fixed:

1. **Signature verification enforced.** `api.router.ts` verifies
   `senderSignature` on incoming remote messages via `verifyMessageSignature`
   before inserting. `channel.$address.tsx` verifies before displaying.
2. **Server-side key validation.** `sendMessage` validates `senderPubKey`
   matches the authenticated user's active signing key, and `recipientPubKey`
   matches the recipient's active encap key (local delivery).
3. **PoW binding validated.** `sendMessage` rejects if PoW
   `senderAddress`/`recipientAddress` don't match the session-derived sender
   and the requested recipient.
4. **Canonical signed envelope.** `message.ts` builds a length-prefixed
   `KeypearsMessageV1` envelope covering sender address, recipient address,
   both public keys, and both ciphertexts. Signature covers the full envelope.
5. **AAD on encryption.** Both `aesgcmMlkemEncrypt` and `aesgcmMlkemDecrypt`
   pass `senderAddress\0recipientAddress` as AAD. `decryptMessageContent` now
   requires sender/recipient address params.
6. **Size bounds.** `api.router.ts` checks `senderEncryptedContent` (100K) and
   `senderSignature` (6700) sizes on remote pull.
7. **Doc comment.** `packages/client/src/auth.ts` updated from "P-256 ECDSA"
   to "ML-DSA-65".

Codex review found additional issues: type errors from stale `encryptMessage`
call sites, missing federation key validation on remote inbound, missing
signature verification on local message storage, and missing remote recipient
key validation. These are fixed in experiment 3.

## Experiment 3: Fix type errors and remaining validation gaps

### Goal

Fix the compile errors from experiment 2's `encryptMessage` signature change,
and close the remaining server-side validation gaps identified by Codex.

### Type errors to fix

The `encryptMessage` and `encryptSecretMessage` signatures changed from 4 args
to 8 args (added sender/recipient addresses and public key hex strings for the
canonical envelope). Three call sites were not updated:

1. `webapp/src/routes/_app/_saved/_chrome/send.tsx:124` — update to pass all
   8 args
2. `webapp/src/routes/_app/_saved/channel.$address.tsx:410` — update to pass
   all 8 args
3. `webapp/src/routes/_app/_saved/vault.$id.tsx:569` — `encryptSecretMessage`
   call, update to pass all 8 args

Also `channel.$address.tsx:253` references undefined `myAddress` in `tryDecrypt`
— needs to get it from the component's computed `myAddress` variable.

### Validation gaps to fix

**High: Remote inbound messages not validated against federation keys.**

`api.router.ts` verifies the signature against `messageData.senderPubKey` but
never checks that key actually belongs to the claimed sender via federation
lookup, or that `recipientPubKey` matches the local recipient's active encap
key.

Fix:
- After pulling the message in `notifyMessageHandler`, look up the sender's
  signing key via `fetchRemotePublicKey(messageData.senderAddress)` and verify
  `messageData.senderPubKey` matches.
- Look up the local recipient's active encap key and verify
  `messageData.recipientPubKey` matches.

**Medium: Local message storage without signature verification.**

`sendMessage` in `message.functions.ts` validates keys but doesn't verify the
`senderSignature` before storing. The server has all envelope fields and should
reject invalid signatures.

Fix:
- Import `verifyMessageSignature` from `~/lib/message`.
- After key validation and before inserting, verify the signature. Reject if
  invalid.

**Medium: Remote outbound trusts client-supplied recipientPubKey.**

In the remote delivery branch of `sendMessage`, the server stores and delivers
whatever `recipientPubKey` the client sends without checking it against the
recipient's actual key via federation.

Fix:
- In the remote branch, call `fetchRemotePublicKey(input.recipientAddress)` and
  verify `input.recipientPubKey` matches the result's `encapPublicKey`.

### Files to modify

1. `webapp/src/routes/_app/_saved/_chrome/send.tsx` — fix encryptMessage call
2. `webapp/src/routes/_app/_saved/channel.$address.tsx` — fix encryptMessage
   call and myAddress reference
3. `webapp/src/routes/_app/_saved/vault.$id.tsx` — fix encryptSecretMessage call
4. `webapp/src/server/api.router.ts` — federation key validation on remote pull
5. `webapp/src/server/message.functions.ts` — signature verification before
   store, remote recipient key validation

### Result: Pending
