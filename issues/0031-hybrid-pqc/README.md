+++
status = "open"
opened = "2026-04-26"
+++

# Switch to hybrid post-quantum cryptography

## Goal

Replace KeyPears' pure ML-DSA-65 / ML-KEM-768 cryptography with hybrid composite
constructions that combine classical and post-quantum algorithms. Research which
constructions are standardized or closest to standardization, and adopt them.

## Background

### Why hybrid

KeyPears currently uses pure post-quantum cryptography — no classical algorithms
remain. This is a bet that ML-DSA and ML-KEM have no structural flaws. The
industry consensus is that this bet is premature:

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

- **Encryption**: classical key exchange (ECDH/X25519) AND ML-KEM-768 must both
  be broken to recover the message key.
- **Signatures**: classical signature (ECDSA/Ed25519) AND ML-DSA-65 must both be
  forged to impersonate a user.

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
4. Does the user need three key pairs (classical signing + PQ signing + PQ KEM)
   or can it be simplified?
5. What does `@webbuf/aesgcm-p256dh-mlkem` already handle correctly, and what
   needs changing?

### Key pair model

Currently each user has two key pairs:

- ML-DSA-65 (signing)
- ML-KEM-768 (encryption)

Hybrid would require adding classical key pairs:

- P-256 or Ed25519 (classical signing)
- P-256 or X25519 (classical key exchange) — unless `aesgcm-p256dh-mlkem`
  handles this at the message level without a persistent classical DH key

The `@webbuf/aesgcm-p256dh-mlkem` package uses ephemeral P-256 ECDH — the sender
generates a fresh P-256 key pair per message. The persistent key is only the
ML-KEM encap key. This may simplify the key model.

For composite signatures, the user would need a persistent classical signing key
alongside the ML-DSA-65 key. A composite signature = classical sig + PQ sig
concatenated.

## Plan

1. Research the exact constructions becoming standard for hybrid PQC —
   encryption and signatures. Determine which classical algorithms to use.
2. Implement hybrid encryption and composite signatures in KeyPears.

## Experiment 1: Survey hybrid PQC constructions

### Goal

Identify what every major project and standards body is doing for hybrid PQC.
Determine which construction KeyPears should adopt.

### Findings

#### Production deployments (KEM only — no PQ signatures in production)

**Signal PQXDH** (deployed late 2023):
- KEM: X25519 + ML-KEM-1024 (Kyber-1024)
- Combiner: HKDF-SHA-512 over concatenated DH outputs + KEM shared secret
- Signatures: still classical (XEdDSA on Curve25519) — no PQ signatures
- Status: production, formally verified

**Chrome TLS X25519MLKEM768** (deployed Chrome 124, early 2024):
- KEM: X25519 + ML-KEM-768
- Combiner: simple concatenation → TLS HKDF key schedule
- Ordering: ML-KEM-SS first, then X25519-SS (FIPS-approved scheme first)
- Signatures: still classical (RSA/ECDSA certificates)
- Status: production, also supported by Cloudflare and AWS

**Chrome TLS SecP256r1MLKEM768**:
- KEM: P-256 ECDH + ML-KEM-768
- Same pattern, P-256 SS first
- Status: production

#### Standards-track drafts

**IETF OpenPGP PQC** (`draft-ietf-openpgp-pqc-07`, Feb 2025):
- KEM (MUST): ML-KEM-768 + X25519
- KEM combiner: SHA3-256 over all inputs (both shared secrets, both
  ciphertexts, both public keys, algorithm ID, domain separator
  `"OpenPGPCompositeKDFv1"`)
- Signatures (MUST): ML-DSA-65 + Ed25519
- Signature method: both sign the same SHA3-256 pre-hashed digest
  independently. Both must verify. Concatenated in the packet.
- Status: active IETF draft, interop testing underway

**IETF LAMPS Composite Signatures** (`draft-ietf-lamps-pq-composite-sigs-19`,
Apr 2026):
- ML-DSA-65 + Ed25519-SHA512 (defined combination)
- ML-DSA-65 + ECDSA-P256-SHA512 (also defined)
- ML-DSA-44 + Ed25519-SHA512 (lower security level)
- Combiner: pre-hash with domain separation. Message representative:
  `Prefix || Label || len(ctx) || ctx || PH(M)` where Prefix =
  `"CompositeAlgorithmSignatures2025"` and Label is per-algorithm.
  Both algorithms sign this independently. Serialized as concatenation
  (ML-DSA has fixed-length output).
- Status: Standards Track draft-19, nearing completion

**IETF LAMPS Composite KEM** (`draft-ietf-lamps-pq-composite-kem-14`,
Mar 2026):
- ML-KEM-768 + X25519 (defined)
- ML-KEM-768 + P-256 ECDH (defined)
- Combiner: SHA3-256 over `mlkemSS || tradSS || tradCT || tradPK || Label`.
  Includes ciphertext and public key for context binding.
- ECDH "promoted to KEM" via ephemeral keypair (sender generates fresh key
  per message, sender's public key = ciphertext)
- Status: Standards Track draft-14

**NIST SP 800-227** (Sep 2025):
- General KEM recommendations, not hybrid-specific
- Points to SP 800-56Cr2 for combining shared secrets via approved KDFs

### Analysis

#### The emerging standard pairings

The clearest consensus across ALL standards bodies:

| Purpose | Classical | PQ | Sources |
|---------|-----------|-----|---------|
| KEM | X25519 | ML-KEM-768 | Signal, Chrome, OpenPGP, LAMPS |
| Signatures | Ed25519 | ML-DSA-65 | OpenPGP (MUST), LAMPS |

The Curve25519 family (X25519 for KEM, Ed25519 for signatures) is the
universal classical choice. P-256 is supported but secondary.

#### KEM combiner consensus

Three approaches exist, from simplest to most thorough:

1. **Concatenation → existing KDF** (TLS): `mlkemSS || ecdhSS` fed into
   HKDF. Simplest. Works because TLS already has a robust key schedule.
2. **HKDF over concatenation** (Signal): same idea with explicit HKDF call.
3. **SHA3-256 with full context** (OpenPGP, LAMPS): includes ciphertexts,
   public keys, algorithm label, domain separator. Strongest binding.

The LAMPS/OpenPGP approach is the most rigorous but also the most complex.
For a messaging protocol like KeyPears, the Signal/TLS approach (HKDF over
concatenated shared secrets) is sufficient and already implemented in
`@webbuf/aesgcm-p256dh-mlkem`.

#### Composite signature consensus

The pattern is consistent:
1. Pre-hash the message (with domain-separated prefix)
2. Both algorithms sign the same pre-hashed message independently
3. Concatenate both signatures (ML-DSA has fixed length, so splitting is
   trivial)
4. Both must verify

This is NOT yet implemented in webbuf.

### What webbuf has vs. what's needed

| Need | WebBuf package | Status |
|------|---------------|--------|
| Hybrid KEM (P-256 + ML-KEM) | `@webbuf/aesgcm-p256dh-mlkem` | Ready |
| Hybrid KEM (X25519 + ML-KEM) | — | Missing (no X25519 package) |
| P-256 ECDH | `@webbuf/p256` | Ready |
| P-256 ECDSA | `@webbuf/p256` | Ready |
| X25519 | — | Missing |
| Ed25519 | — | Missing |
| ML-KEM-768 | `@webbuf/mlkem` | Ready |
| ML-DSA-65 | `@webbuf/mldsa` | Ready |
| Composite signatures | — | Missing |

### Decision: which construction to adopt

**Option A: P-256 family** (what we have)
- KEM: P-256 ECDH + ML-KEM-768 via `@webbuf/aesgcm-p256dh-mlkem`
- Signatures: P-256 ECDSA + ML-DSA-65 (build composite in webbuf)
- Pro: all packages exist or only need a thin composite wrapper
- Con: not the primary pairing in OpenPGP/LAMPS (they prefer Curve25519)

**Option B: Curve25519 family** (what the standards prefer)
- KEM: X25519 + ML-KEM-768
- Signatures: Ed25519 + ML-DSA-65
- Pro: matches OpenPGP MUST, Signal, Chrome, LAMPS primary pairings
- Con: requires building X25519 and Ed25519 packages in webbuf first

**Option C: Mixed** (P-256 for KEM since we have it, Ed25519 for signatures)
- Not a standard combination — avoid.

**Recommendation: Option A (P-256 family) for now.** The `@webbuf/aesgcm-
p256dh-mlkem` package already exists and follows the TLS/Signal combiner
pattern. P-256 + ML-KEM-768 is a defined combination in LAMPS
(`id-MLKEM768-ECDH-P256-SHA3-256`). P-256 ECDSA + ML-DSA-65 is also defined
in LAMPS (`id-MLDSA65-ECDSA-P256-SHA512`). We can ship hybrid immediately
without building new webbuf primitives.

If we later want to align with the OpenPGP MUST pairing (Curve25519), we can
add X25519 and Ed25519 to webbuf and switch. But P-256 hybrid is strictly
better than pure PQ, which is what we have now.

### What needs to happen

1. **Encryption**: swap `@webbuf/aesgcm-mlkem` for
   `@webbuf/aesgcm-p256dh-mlkem` in message encryption. The hybrid package
   already exists with HKDF-SHA-256 combiner and version byte `0x02`.

2. **Signatures**: build a composite signature helper — sign with both P-256
   ECDSA and ML-DSA-65, verify both. This can be a thin wrapper in keypears
   (or a new webbuf package). Format: ML-DSA-65 signature (3,309 bytes) ||
   P-256 ECDSA signature (64 bytes). Split at byte 3,309.

3. **Key model**: each user needs three key pairs:
   - P-256 (classical signing + classical ECDH for hybrid KEM)
   - ML-DSA-65 (PQ signing)
   - ML-KEM-768 (PQ encryption)
   
   Wait — `@webbuf/aesgcm-p256dh-mlkem` uses EPHEMERAL P-256 ECDH (fresh key
   per message). The sender doesn't need a persistent P-256 DH key. The
   recipient only needs the ML-KEM encap key. So for encryption, the key
   model stays as-is (ML-KEM-768 encap key only). The P-256 ephemeral is
   generated inside the package.

   For signatures, the user needs:
   - P-256 signing key pair (persistent, for composite signatures)
   - ML-DSA-65 signing key pair (persistent, for composite signatures)
   - ML-KEM-768 encap key pair (persistent, for encryption)

   That's three key pairs per user instead of two.

### Result: Pass

The industry consensus is clear: hybrid with Curve25519 as the primary
classical component. WebBuf issue 0007 built all four needed packages:
`@webbuf/x25519`, `@webbuf/ed25519`, `@webbuf/aesgcm-x25519dh-mlkem`,
`@webbuf/sig-ed25519-mldsa`. KeyPears can go straight to the Curve25519-first
standard pairing with no throwaway migration.

## Experiment 2: Switch KeyPears to hybrid Curve25519 + PQ

### Goal

Replace all pure-PQ cryptography with hybrid Curve25519 + PQ:
- Encryption: `@webbuf/aesgcm-mlkem` → `@webbuf/aesgcm-x25519dh-mlkem`
- Signatures: `mlDsa65Sign`/`mlDsa65Verify` → `sigEd25519MldsaSign`/`sigEd25519MldsaVerify`
- Key model: add Ed25519 signing key pair (three key pairs per user)

Zero users, DB will be deleted. No backwards compatibility.

### Key model change

Currently two key pairs:
- ML-DSA-65 (signing key 4,032 bytes, verifying key 1,952 bytes)
- ML-KEM-768 (decap key 2,400 bytes, encap key 1,184 bytes)

New: three key pairs:
- Ed25519 (private key 32 bytes, public key 32 bytes) — classical signing
- ML-DSA-65 (signing key 4,032 bytes, verifying key 1,952 bytes) — PQ signing
- ML-KEM-768 (decap key 2,400 bytes, encap key 1,184 bytes) — PQ encryption

The composite signature package `@webbuf/sig-ed25519-mldsa` takes BOTH signing
keys and produces a composite signature (3,374 bytes = 1 version byte + 64
Ed25519 + 3,309 ML-DSA). Verification takes both verifying keys. The caller
doesn't manage the two signatures separately.

For encryption, `@webbuf/aesgcm-x25519dh-mlkem` uses EPHEMERAL X25519 — the
sender generates a fresh X25519 key per message internally. The persistent key
is only the ML-KEM encap key. No persistent X25519 key needed.

### DB schema changes

**`user_keys` table — add Ed25519 columns:**
- `ed25519PublicKey` blob — 32 bytes
- `encryptedEd25519Key` blob — 32 bytes + AES-GCM overhead (~80 bytes)

**`messages` table — add Ed25519 sender public key:**
- `senderEd25519PubKey` blob — 32 bytes (needed for composite signature
  verification — verifier needs both the Ed25519 and ML-DSA public keys)

**`pending_deliveries` table — same addition:**
- `senderEd25519PubKey` blob — 32 bytes

Keep existing ML-DSA and ML-KEM columns unchanged.

### Dependencies

**Add to `webapp/package.json`:**
- `@webbuf/aesgcm-x25519dh-mlkem`
- `@webbuf/sig-ed25519-mldsa`
- `@webbuf/ed25519`

**Remove:**
- `@webbuf/aesgcm-mlkem` (replaced by hybrid)

**Keep:**
- `@webbuf/mldsa` (still needed — composite package depends on it internally,
  and it's used for standalone ML-DSA operations in the signing key model)
- `@webbuf/mlkem` (still needed for ML-KEM key pairs)

**Update `packages/client/package.json`:**
- Replace `@webbuf/mldsa` with `@webbuf/sig-ed25519-mldsa` for auth
  verification

### Code changes

**`webapp/src/lib/auth.ts`:**
- `generateAndEncryptKeyPairFromEncryptionKey`: add Ed25519 key pair
  generation via `ed25519PublicKeyCreate` / `FixedBuf.fromRandom(32)`.
  Encrypt Ed25519 private key with AES-GCM. Return 6 fields instead of 4.
- Add `decryptEd25519Key(encrypted: WebBuf, encryptionKey: FixedBuf<32>)`
  → `FixedBuf<32>`
- `signPowRequest`: switch from `mlDsa65Sign` to `sigEd25519MldsaSign`.
  Takes both `ed25519Key: FixedBuf<32>` and `mldsaKey: FixedBuf<4032>`.
  Returns composite signature hex.

**`webapp/src/lib/message.ts`:**
- Replace `aesgcmMlkemEncrypt`/`aesgcmMlkemDecrypt` with
  `aesgcmX25519dhMlkemEncrypt`/`aesgcmX25519dhMlkemDecrypt`. API is the same
  (takes ML-KEM encap key + plaintext + AAD). The X25519 ephemeral is handled
  internally.
- Replace `mlDsa65Sign`/`mlDsa65Verify` with
  `sigEd25519MldsaSign`/`sigEd25519MldsaVerify`. Composite sign takes both
  private keys. Composite verify takes both public keys.
- `encryptMessage`/`encryptSecretMessage`: add `ed25519Key` parameter
- `verifyMessageSignature`: add `ed25519PubKey` parameter
- `buildSignedEnvelope`: include Ed25519 public key in the envelope

**`webapp/src/server/api.router.ts`:**
- `getPublicKey`: return `ed25519PublicKey` alongside existing keys
- `getPowChallengeEndpoint`: verify composite signature using
  `sigEd25519MldsaVerify`. Validate BOTH submitted public keys against
  federation: `senderKeyResult.signingPublicKey === input.senderPubKey` AND
  `senderKeyResult.ed25519PublicKey === input.senderEd25519PubKey`. Reject if
  either mismatches.
- `notifyMessageHandler`: after pulling remote message, validate BOTH sender
  keys against federation: `senderKeys.signingPublicKey` matches
  `messageData.senderPubKey` AND `senderKeys.ed25519PublicKey` matches
  `messageData.senderEd25519PubKey`. Reject if either mismatches. Then verify
  composite signature with both keys.

**`webapp/src/server/user.server.ts`:**
- `insertKey`: accept 6 key fields instead of 4
- `saveUser`, `createUserForDomain`, `resetUserPassword`: same
- `changePassword`, `reEncryptKey`: handle 3 encrypted keys per key pair

**`webapp/src/server/user.functions.ts`:**
- Update all validators to include Ed25519 fields
- `getMyKeys`, `getMyEncryptedKeys`: return Ed25519 fields
- `getProfile`: return `ed25519PublicKey`

**`webapp/src/server/message.functions.ts`:**
- `getPublicKeyForAddress`: return `ed25519PublicKey`
- `sendMessage`: add `senderEd25519PubKey` to input validator. Validate it
  matches the authenticated user's active Ed25519 key. Pass to `insertMessage`
  and `deliverRemoteMessage`.
- `getMyActiveEncryptedKey`: return `ed25519PublicKey` and `encryptedEd25519Key`

**`webapp/src/server/message.server.ts`:**
- `insertMessage`: add `senderEd25519PubKey` parameter

**`webapp/src/routes/_app/_saved/sign.tsx`:**
- Decrypt both Ed25519 and ML-DSA keys for composite signing
- `signPayload`: use `sigEd25519MldsaSign` with both keys

**`packages/client/src/contract.ts`:**
- `getPublicKey` output: add `ed25519PublicKey`
- `getPowChallenge` input: add `senderEd25519PubKey` field (needed for
  composite signature verification on the challenge request)
- `notifyMessage` input: add `senderEd25519PubKey`
- `pullMessage` output: add `senderEd25519PubKey`

**`packages/client/src/auth.ts`:**
- `verifyCallback`: use `sigEd25519MldsaVerify` with both public keys

**`webapp/src/server/federation.server.ts`:**
- `fetchRemotePublicKey`: return `ed25519PublicKey` alongside existing keys
- `deliverRemoteMessage`: accept and store `senderEd25519PubKey`

**All route files (welcome, keys, password, domains, send, channel, vault):**
- Same pattern as issue 0027: destructure 6 key fields instead of 4,
  pass Ed25519 keys where signing happens

### Size constant updates

Composite signatures are 3,374 bytes (not 3,309). Update all hardcoded sizes:
- `api.router.ts`: signature size check changes from 6,700 to 6,750 hex chars
- `message.ts`: `FixedBuf.fromBuf(3309, ...)` → remove direct ML-DSA size
  references — the composite package handles this internally
- `auth.ts`: `FixedBuf<4032>` for ML-DSA signing key stays (composite takes
  both keys separately)
- Any `FixedBuf.fromHex(1952, ...)` or `FixedBuf.fromHex(3309, ...)` that
  referenced standalone ML-DSA sizes needs review — if going through the
  composite package, these are handled internally

### Verification

- `bun run db:clear && bun run db:push` — schema creates
- `bun run typecheck` — zero errors
- `bun run lint` — zero errors
- `bun run test` — passes
- Manual: create account, send message, vault entry, auth sign-in
- `grep -r "aesgcm-mlkem\b" webapp/src/ packages/client/src/` — zero matches
  (only `aesgcm-x25519dh-mlkem`)
- `grep -r "mlDsa65Sign\|mlDsa65Verify" webapp/src/ packages/client/src/` —
  zero direct ML-DSA sign/verify (only composite)

### Result: Pending
