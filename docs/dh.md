# Diffie-Hellman Key Exchange Protocol

This document describes KeyPears' federated Diffie-Hellman (DH) key exchange
protocol, which enables end-to-end encrypted communication between any two
email-style addresses across different domains.

> **Related**: For the full messaging protocol that builds on this DH system,
> see [Messaging System](./messages.md). This document focuses on the DH key
> exchange mechanics, while messages.md covers the complete messaging flow
> including PoW spam prevention, channel management, and vault sync.

## Overview

KeyPears enables secure secret sharing between any two vault addresses, such as
`alice@alicecompany.com` and `bob@bobcompany.com`. The protocol is designed with
privacy by default: no metadata that doesn't need to be on a server touches the
server, and no data that doesn't need to be public is exposed publicly.

### Core Goals

1. **End-to-end encryption**: Only Alice and Bob can read shared secrets
2. **Federated architecture**: Any domain can participate (email-like model)
3. **Privacy by default**: Minimize metadata exposure to servers and third
   parties
4. **Relationship isolation**: Compromise of one relationship doesn't cascade to
   others
5. **Server-assisted but zero-knowledge**: Servers coordinate without learning
   secrets

## The Privacy Problem

Each vault has a master key (secp256k1 private key) with a corresponding public
key. The naive approach would be to simply publish each vault's public key and
let counterparties compute shared secrets via ECDH.

**Why this is problematic**:

- Exposing the vault's primary public key enables correlation across all
  relationships
- A quantum computer could derive the private key from the public key,
  compromising all relationships
- Metadata leakage: observers can see who Alice is communicating with based on
  which public keys she fetches

**Our solution**: Use deterministic key derivation to create unique
public/private keypairs for each relationship. Alice and Bob each have a
relationship-specific keypair that is mathematically derived from their vault
keys but reveals nothing about the underlying vault keys.

## Key Mathematical Property

A critical property of elliptic curve cryptography enables this protocol:

**If you add two public keys together, you get a new public key that corresponds
to adding the two corresponding private keys together.**

```
Given:
  Private key A → Public key A
  Private key B → Public key B

Then:
  (Private key A + Private key B) → (Public key A + Public key B)
```

This means a server can:

1. Generate a new random keypair (private_r, public_r)
2. Add public_r to a user's public key to get a new derived public key
3. Share private_r with the user (but not the original private key)
4. The user adds private_r to their vault key to get the derived private key

The server never learns the user's actual vault private key, yet can generate
valid derived public keys on the user's behalf.

## Domain Discovery

Each KeyPears-compatible domain publishes a well-known configuration file:

```
https://example.com/.well-known/keypears.json
```

Contents:

```json
{
  "version": 1,
  "api_url": "https://api.example.com/keypears",
  "public_key_endpoint": "/vaults/{username}/public-key",
  "message_endpoint": "/vaults/{username}/messages"
}
```

This enables any client to discover how to interact with any domain's KeyPears
API.

## Protocol Flow

> **Implementation Note**: The implementation uses Proof-of-Work (PoW) for DoS
> prevention AND ECDSA signatures for sender identity verification. See
> [messages.md](./messages.md) for the complete messaging protocol. The sender
> signs the PoW hash with their engagement private key, and the recipient's
> server performs cross-domain verification to confirm the pubkey belongs to
> the claimed sender address.

### Step 1: Alice Initiates Contact

Alice (`alice@1.com`) wants to send a secret to Bob (`bob@2.com`).

**On Alice's client**:

1. Alice's client generates a deterministic engagement key for the Alice↔Bob
   relationship
2. The engagement key is derived from:
   - Alice's vault private key
   - A canonical identifier for the relationship (e.g.,
     `sha256("alice@1.com" + "bob@2.com")`)
3. Alice's client sends a request to her server (`1.com`) to register this new
   public key for the engagement

**On Alice's server (`1.com`)**:

1. Server receives Alice's derived public key for the Bob engagement
2. Server stores this mapping: `alice → bob@2.com → derived_public_key_A`
3. Server can attest: "This public key belongs to Alice for communications with
   Bob"

### Step 2: Alice Requests Bob's Engagement Key

**Alice gets PoW challenge from Bob's server (`2.com`)**:

1. Alice requests a PoW challenge, including sender and recipient addresses
2. Bob's server returns challenge with difficulty based on:
   - Per-channel setting for Alice (if exists)
   - Bob's global `messagingMinDifficulty` setting
   - System default (~4 million)

**Alice solves PoW and signs the result**:

1. Alice mines until hash meets target difficulty
2. Alice signs the solved hash with her engagement private key
3. This signature proves Alice owns the private key for her claimed pubkey

**Alice's client → Bob's server (`2.com`)** with three-layer verification:

1. Alice sends: addresses, her pubkey, PoW proof, signature
2. Bob's server performs THREE verification checks:
   - **PoW verification**: Hash meets target, not expired, not already used
   - **Signature verification**: Signature is valid for Alice's claimed pubkey
   - **Cross-domain identity verification**: See below

**Bob's server (`2.com`) → Alice's server (`1.com`)** for identity verification:

1. Bob's server calls Alice's server: `verifyEngagementKeyOwnership`
2. Asks: "Does this public key belong to alice@1.com?"
3. Alice's server checks if an engagement key exists with:
   - Matching vault (by address)
   - Matching pubkey
   - Purpose = "send"
4. Returns `{ valid: true }` if found, `{ valid: false }` otherwise

**Bob's server generates Bob's engagement key** (only if ALL checks pass):

1. Server uses the key addition property to generate a derived public key for Bob
2. This derived key is specific to the Alice↔Bob relationship
3. Server marks the PoW as consumed with channel binding (sender/recipient/pubkey)
4. Server stores the mapping and returns Bob's engagement public key to Alice

### Step 3: Shared Secret Computation

Both parties can now compute the shared secret:

**Alice's side**:

```
shared_secret = ECDH(alice_engagement_private_key, bob_engagement_public_key)
```

**Bob's side**:

```
shared_secret = ECDH(bob_engagement_private_key, alice_engagement_public_key)
```

By the properties of ECDH, both computations yield the same shared secret.

### Step 4: Encrypted Communication

Alice can now:

1. Encrypt a secret using the shared secret (AES-256)
2. Sign the encrypted message with her engagement private key
3. Send to Bob's server for delivery

Bob can:

1. Verify the signature using Alice's engagement public key
2. Decrypt using the shared secret
3. Accept or reject the secret into his vault

## Server-Side Key Generation

The server generates engagement keys for users without knowing their vault
private keys. This is achieved through a three-entropy derivation system that
combines:

1. **Server entropy** (from `DERIVATION_ENTROPY_N` env vars)
2. **DB entropy** (random 32 bytes generated per key)
3. **User's vault public key** (known to server)

The derived public key is computed as:

```
derivation_privkey = HMAC-SHA256(server_entropy, db_entropy)
derivation_pubkey = derivation_privkey * G
derived_pubkey = vault_pubkey + derivation_pubkey
```

The server stores `db_entropy` and the `server_entropy_index`, enabling it to
recompute `derivation_privkey` when the user needs it. The user then adds their
vault private key to get the final derived private key:

```
derived_privkey = vault_privkey + derivation_privkey
```

**Security properties**:

- Server never learns `vault_privkey`
- Server knows `derivation_privkey` but this is useless without `vault_privkey`
- User can verify: `derived_privkey * G == derived_pubkey`

See **Engagement Key Generation System** below for the complete specification.

## Server-Side Entropy Management

The server needs its own entropy for deriving engagement keys. This **derivation
entropy** is hashed to derive private keys, and must be carefully managed:
rotated periodically, never deleted, and tracked so the correct entropy is used
for re-derivation.

### Derivation Entropy Storage

Derivation entropy is stored as environment variables using an incrementing
index pattern:

```
DERIVATION_ENTROPY_1=<hex-encoded 32-byte entropy>
DERIVATION_ENTROPY_2=<hex-encoded 32-byte entropy>
DERIVATION_ENTROPY_3=<hex-encoded 32-byte entropy>
```

These are stored in `.env.*` files encrypted with `dotenvx`. Each value appears
as a separate line, making diffs readable and auditable.

**Why this pattern**:

- **Human-readable diffs**: Easy to see when new entropy was added
- **Simple rotation**: Add `DERIVATION_ENTROPY_N+1`, redeploy
- **No parsing complexity**: Each value is a simple hex string
- **Clear audit trail**: The index indicates entropy generation order
- **Self-hosting friendly**: No external dependencies (KMS, HSM, etc.)

### Entropy Selection on Server Boot

When the server starts, it loads all derivation entropy and identifies the
current one:

```typescript
function loadDerivationEntropy(): {
  entropy: Map<number, FixedBuf<32>>;
  currentIndex: number;
} {
  const entropy = new Map<number, FixedBuf<32>>();

  for (let i = 1; ; i++) {
    const entropyHex = process.env[`DERIVATION_ENTROPY_${i}`];
    if (!entropyHex) break;
    entropy.set(i, FixedBuf.fromHex(32, entropyHex));
  }

  if (entropy.size === 0) {
    throw new Error("No derivation entropy found. Set DERIVATION_ENTROPY_1.");
  }

  const currentIndex = Math.max(...entropy.keys());
  return { entropy, currentIndex };
}
```

**Rules**:

- Entropy must be numbered sequentially starting from 1 (no gaps)
- The highest-numbered entropy is the "current" one for new derivations
- All entropy is kept in memory for re-derivation of historical engagement keys

### Tracking Derivation Entropy Usage

When the server derives an engagement key, it records which derivation entropy
was used:

```typescript
// Database schema for engagement keys
engagement_keys: {
  id: uuidv7(),
  username: "bob",
  engagement_public_key: "02abc...",
  encrypted_random_private: "...",
  derivation_entropy_index: 2,    // Used DERIVATION_ENTROPY_2
  vault_generation: 3,
  initiator_address: "alice@1.com",
  created_at: timestamp,
}
```

When re-deriving (e.g., Bob retrieves his engagement private key), the server
uses the same derivation entropy index that was originally used:

```typescript
function recomputeEngagementKey(engagementKeyRecord: EngagementKey): FixedBuf<33> {
  const entropy = derivationEntropy.get(engagementKeyRecord.derivation_entropy_index);
  if (!entropy) {
    throw new Error(`Missing derivation entropy ${engagementKeyRecord.derivation_entropy_index}`);
  }
  // Use entropy to recompute...
}
```

### Entropy Rotation Schedule

**Recommended rotation**: Every 90 days for server operators.

This is longer than the 45-day vault rotation recommendation because:

- Server entropy protects many users, so rotation is more operationally complex
- The derivation entropy is never exposed publicly (unlike engagement keys)
- Old entropy must be retained indefinitely anyway

**Rotation process**:

1. Generate new 32-byte random entropy
2. Add to `.env.*` as `DERIVATION_ENTROPY_N+1`
3. Encrypt with `dotenvx`
4. Deploy (server will automatically use the new entropy for new derivations)
5. Old entropy remains for historical re-derivation

### Startup Validation

The server should validate derivation entropy on boot:

```typescript
function validateDerivationEntropy(entropy: Map<number, FixedBuf<32>>): void {
  // Check for gaps
  const indices = [...entropy.keys()].sort((a, b) => a - b);
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== i + 1) {
      throw new Error(`Gap in derivation entropy: missing DERIVATION_ENTROPY_${i + 1}`);
    }
  }

  // Warn if only one entropy value (rotation overdue)
  if (entropy.size === 1) {
    console.warn("Only one derivation entropy configured. Consider adding a rotation.");
  }
}
```

### Environment Separation

Development and production use separate `.env.*` files with different entropy:

- `.env.development`: `DERIVATION_ENTROPY_1`, `DERIVATION_ENTROPY_2`, ...
- `.env.production`: `DERIVATION_ENTROPY_1`, `DERIVATION_ENTROPY_2`, ...

The same index (e.g., `1`) refers to different actual entropy in each
environment. This is safe because:

- Dev and production databases are completely separate
- Engagement keys are never migrated between environments
- The index is only meaningful within a single environment

### Security Considerations

**Never delete derivation entropy**: Even after rotation, old entropy is needed
to re-derive historical engagement keys. Deleting entropy would break all
engagement keys that used it.

**Protect `.env.*` files**: These contain the server's most sensitive secrets.
Use `dotenvx` encryption and restrict access.

**No entropy in logs**: Never log derivation entropy or derived values.

**Backup strategy**: Ensure derivation entropy is backed up securely. Loss of
this entropy would break all engagement key re-derivation.

## Engagement Key Generation System

This section describes the complete key derivation system that enables servers
to generate engagement public keys while ensuring only the vault owner can
derive the corresponding private keys.

### The Core Problem

When Alice wants to send an encrypted message to Bob, she needs Bob's public
key. But Bob might be offline. The server needs to generate a fresh public key
for Bob that:

1. Only Bob can derive the corresponding private key
2. The server never learns Bob's vault private key
3. Each engagement gets a unique keypair (privacy isolation)

### Three Entropy Sources

KeyPears uses three sources of entropy to derive keys:

**1. Server Entropy** (`DERIVATION_ENTROPY_N` from env vars)

- Rotated every ~90 days
- Known only to the server (in memory, never in database)
- Index is stored with each engagement key for re-derivation

**2. DB Entropy** (random 32 bytes per engagement key)

- Generated fresh for each engagement key
- Stored in database
- Unique per key, provides per-key randomness

**3. User's Vault Key** (user's master private key)

- Known only to the user
- Never leaves the user's device
- The "secret ingredient" that only the client has

### Key Derivation Flow

#### Server-Side: Generating a New Public Key for Bob

When Alice requests an engagement key for Bob, Bob's server performs:

```
1. Generate random DB entropy:
   db_entropy = random(32 bytes)

2. Compute derivation private key using HMAC:
   derivation_privkey = HMAC-SHA256(key: server_entropy, data: db_entropy)

3. Compute derivation public key:
   derivation_pubkey = derivation_privkey * G

4. Compute engagement public key (Bob's new engagement public key):
   engagement_pubkey = bob_vault_pubkey + derivation_pubkey

5. Store in database:
   - db_entropy (needed to re-derive later)
   - db_entropy_hash = SHA256(db_entropy) (for integrity/lookup)
   - server_entropy_index (which DERIVATION_ENTROPY_N was used)
   - derivation_pubkey (the "addend" public key)
   - bob_vault_pubkey (which vault this belongs to)
   - engagement_pubkey (the final engagement public key)
   - engagement_pubkey_hash = SHA256(engagement_pubkey) (for quick lookups)

6. Return engagement_pubkey to Alice
```

#### Client-Side: Bob Derives the Private Key

When Bob needs to use the engagement private key (e.g., to decrypt a message):

```
1. Bob requests engagement key info from server

2. Server recomputes and returns:
   derivation_privkey = HMAC-SHA256(key: server_entropy, data: db_entropy)
   (Server looks up db_entropy and server_entropy_index from database)

3. Bob computes:
   engagement_privkey = bob_vault_privkey + derivation_privkey

4. Bob verifies:
   engagement_privkey * G == engagement_pubkey (should match)

5. Bob can now use engagement_privkey for ECDH
```

### What Each Party Knows

**Server knows:**

- Server entropy (from env vars, in memory only)
- DB entropy (stored per key in database)
- Derivation private key (can recompute from HMAC)
- Derivation public key
- Bob's vault public key
- Derived public key

**Server CANNOT know:**

- Bob's vault private key
- Engagement private key (would need vault private key to compute)

**Client knows:**

- Vault private key (user's master key)
- Derivation private key (received from server when needed)
- Engagement private key (vault_privkey + derivation_privkey)

### Hash Function Usage

**HMAC-SHA256** derives the derivation private key:

```
derivation_privkey = HMAC-SHA256(key: server_entropy, data: db_entropy)
```

This provides:

- Domain separation between different entropy values
- Unpredictable output without both inputs
- Deterministic re-derivation when both inputs are known

**SHA256** hashes public values for integrity and lookups:

- `db_entropy_hash = SHA256(db_entropy)` - integrity verification
- `engagement_pubkey_hash = SHA256(engagement_pubkey)` - efficient database lookups

### Database Schema (Server - PostgreSQL)

The `engagement_key` table stores all information needed to re-derive keys:

| Field                    | Type      | Purpose                                   |
| ------------------------ | --------- | ----------------------------------------- |
| `id`                     | UUIDv7    | Primary key                               |
| `vault_id`               | FK        | Which vault this key belongs to           |
| `db_entropy`             | 32 bytes  | Random entropy for this key               |
| `db_entropy_hash`        | 32 bytes  | SHA256(db_entropy) for integrity          |
| `server_entropy_index`   | int       | Which DERIVATION_ENTROPY_N was used       |
| `derivation_pubkey`      | 33 bytes  | The "addend" public key                   |
| `engagement_pubkey`      | 33 bytes  | Final engagement public key               |
| `engagement_pubkey_hash` | 32 bytes  | SHA256(engagement_pubkey) for lookups     |
| `counterparty_address`   | string    | Who this key is for (e.g., "alice@1.com") |
| `vault_generation`       | int       | Which generation of the vault             |
| `created_at`             | timestamp | When generated                            |
| `is_used`                | boolean   | Has this key been used in a message?      |

**Indexes:**

- `engagement_pubkey_hash` (unique) - fast lookup by public key
- `vault_id, is_used, created_at` - find unused keys for a vault
- `vault_id, counterparty_address` - find keys for a relationship

### Client Storage (SQLite)

The client may cache engagement key info locally to avoid server round-trips:

| Field                          | Type      | Purpose                          |
| ------------------------------ | --------- | -------------------------------- |
| `id`                           | UUIDv7    | Matches server ID                |
| `engagement_pubkey`            | 33 bytes  | The engagement public key        |
| `engagement_privkey_encrypted` | bytes     | Cached, encrypted with vault key |
| `counterparty_address`         | string    | Who this key is for              |
| `created_at`                   | timestamp | When generated                   |

The engagement private key is cached (encrypted with the vault key) so the user
doesn't need to contact the server every time they want to decrypt a message.

### Security Properties

**Forward Secrecy per Key:**

- Each engagement key is derived from fresh DB entropy
- Compromising one engagement key doesn't help derive others
- Even if server entropy is compromised, attacker still needs DB entropy for
  each key

**Server Cannot Impersonate User:**

- Server can generate public keys but not the corresponding private keys
- Only the vault private key holder can complete the derivation
- Server knows derivation_privkey but not vault_privkey

**Offline Key Generation:**

- Server can pre-generate keys for Bob while Bob is offline
- Alice can encrypt to Bob immediately using derived_pubkey
- Bob derives private key when he comes online

**Entropy Rotation Limits Blast Radius:**

- Server entropy rotates every 90 days
- Old keys remain derivable (server_entropy_index is stored)
- If entropy N is compromised, only keys using index N are affected

### Example Flow: Alice Sends Secret to Bob

**Step 1: Alice requests Bob's engagement key**

Alice's client calls Bob's server:

```
POST https://2.com/api/vaults/bob/engagement-keys
{
  "counterparty": "alice@1.com"
}
```

**Step 2: Bob's server generates engagement key**

Server generates new key using the derivation flow above and returns:

```json
{
  "engagement_pubkey": "02abc123...",
  "vault_generation": 3
}
```

**Step 3: Alice encrypts and sends**

```
shared_secret = ECDH(alice_privkey, bob_engagement_pubkey)
encrypted_message = AES256(shared_secret, plaintext)
```

Alice sends encrypted message to Bob's server.

**Step 4: Bob comes online and decrypts**

Bob's client requests derivation info:

```
GET https://2.com/api/vaults/bob/engagement-keys/{key_id}/derivation-privkey
```

Server returns `derivation_privkey`.

Bob computes:

```
engagement_privkey = bob_vault_privkey + derivation_privkey
shared_secret = ECDH(engagement_privkey, alice_pubkey)
plaintext = AES256_decrypt(shared_secret, encrypted_message)
```

## Verification Protocol

Cross-domain key attestation is **fully implemented**. When a sender requests a
recipient's engagement key, the recipient's server performs three verification
layers before creating any keys.

### Three-Layer Verification (Implemented)

When `2.com` receives a request claiming to be from `alice@1.com`:

**Request from Alice's client to Bob's server (`getCounterpartyEngagementKey`)**:

```json
{
  "recipientAddress": "bob@2.com",
  "senderAddress": "alice@1.com",
  "senderPubKey": "02abc123...",
  "powChallengeId": "01JFXYZ...",
  "solvedHeader": "...",
  "solvedHash": "...",
  "signature": "..." // signature of solvedHash using Alice's engagement privkey
}
```

**Layer 1: PoW Verification**

Bob's server verifies:
- Challenge exists and is not expired
- Challenge has not been used
- Solved hash meets the target difficulty
- Challenge bytes match (prevents header substitution)

**Layer 2: Signature Verification**

Bob's server verifies:
- Signature is valid ECDSA signature over `solvedHash`
- Signature was created with the private key corresponding to `senderPubKey`
- This proves Alice owns the private key for her claimed pubkey

**Layer 3: Cross-Domain Identity Verification**

Bob's server calls Alice's server (`verifyEngagementKeyOwnership`):

```json
// Request to alice's server
{
  "address": "alice@1.com",
  "engagementPubKey": "02abc123..."
}

// Response from alice's server
{
  "valid": true
}
```

Alice's server checks:
- Parse address to get vault name and domain
- Look up vault by name/domain
- Check if an engagement key exists with:
  - `vaultId` matches the vault
  - `engagementPubKey` matches the input
  - `purpose` = "send" (keys created for sending)

**Security note**: No PoW required for `verifyEngagementKeyOwnership` because:
- Public keys are essentially random (can't enumerate)
- No way to list someone's public keys
- This is just a boolean lookup confirmation

### Why This Works

1. **Signature binds identity to PoW**: Alice signs the PoW hash with her
   engagement private key. Only someone with Alice's key can produce this
   signature.

2. **Cross-domain verification binds pubkey to address**: Bob asks Alice's
   server "does this pubkey belong to alice@1.com?". Only Alice's server knows
   which pubkeys are registered to her.

3. **PoW prevents spam**: Attacker must do computational work before getting any
   engagement keys created.

4. **Same key for signature and DH**: The engagement key Alice uses to prove
   identity is the same key used for DH. This creates a cryptographic binding
   between the verified identity and the encrypted channel.

## Privacy Properties

### What Each Party Learns

**Alice's server (`1.com`) learns**:

- Alice has an engagement with Bob at `2.com`
- Alice's engagement public key for Bob
- When Alice sends/receives messages to/from Bob

**Bob's server (`2.com`) learns**:

- Bob has an engagement with Alice at `1.com`
- Bob's engagement public key for Alice
- When Bob sends/receives messages to/from Alice

**Neither server learns**:

- The content of any messages (encrypted with shared secret)
- The vault private keys of either party
- Any other relationships (each engagement has unique keys)

**A third party (Eve) learns**:

- Nothing, unless she compromises a server
- Cannot correlate Alice's activities across different relationships

### Metadata Minimization

- Engagement keys are relationship-specific (no correlation)
- Servers only see encrypted blobs
- Timestamp can be obfuscated with batching (future enhancement)

## Security Considerations

### Quantum Resistance

By never exposing the primary vault public key:

- Quantum attack on one engagement key only compromises that relationship
- Attacker must individually target each relationship
- Primary vault key remains protected

### Server Compromise

If Alice's server is compromised:

- Attacker learns Alice's engagement public keys and relationship metadata
- Attacker cannot decrypt messages (needs Alice's private keys)
- Attacker could potentially MITM new engagements (mitigated by key pinning)

If Bob's server is compromised:

- Same as above, for Bob's side
- Existing shared secrets remain secure

### Key Pinning

After initial key exchange, clients should pin engagement keys:

- Store `(counterparty, engagement_public_key, vault_generation)` locally
- Warn user if key changes unexpectedly
- Require explicit confirmation for key rotation
- Handle vault rotation gracefully (see below)

## Vault Rotation and Key Lifecycle

> **Note**: Vault rotation is **not yet implemented**. This section describes
> the planned design. Currently, vault keys are permanent and cannot be rotated.

A vault name (e.g., `alice@1.com`) is a persistent identity, but the underlying
vault can change. Vault keys are immutable - if a key is lost, stolen, or simply
due for rotation, the user must create a new vault and migrate secrets.

### Why Vaults Must Rotate

- **Key compromise**: If Alice suspects her vault key was exposed, she must
  rotate
- **Key loss**: If Alice loses access to her vault key, she must start fresh
- **Regular hygiene**: Best practice is to rotate keys periodically to limit
  exposure window
- **Immutability**: Vault keys cannot be changed - rotation means creating a new
  vault

### Vault Generation

Each vault at a name has a monotonically increasing **generation number**:

- Generation 1: First vault created at `alice@1.com`
- Generation 2: After first rotation
- Generation N: After (N-1) rotations

Engagement keys are tagged with their vault generation, enabling quick staleness
detection.

### Key Validity Model

Engagement keys have no time-based expiration. Validity is determined solely by
vault generation:

- **Active**: Key was created for the current vault generation → valid for new
  messages
- **Expired**: Key was created for a previous vault generation → vault has
  rotated since
- **Unknown**: Server has no record of this key

Old keys remain valid for decrypting historical messages (assuming the recipient
still has access to the old vault's private key material). They simply cannot be
used for new messages after rotation.

### Public Key Verification API

A public (unauthenticated) endpoint allows anyone to check key validity:

```
GET /api/vaults/{username}/verify-key?key={engagement_public_key}
```

**Response for active key**:

```json
{
  "status": "active",
  "vault_generation": 3,
  "registered_at": "2024-01-15T10:30:00Z"
}
```

**Response for expired key** (vault has rotated):

```json
{
  "status": "expired",
  "vault_generation": 2,
  "current_generation": 3,
  "registered_at": "2024-01-15T10:30:00Z",
  "expired_at": "2024-03-01T14:00:00Z"
}
```

**Response for unknown key**:

```json
{
  "status": "unknown"
}
```

This API enables:

- Senders to verify they have a current key before encrypting
- Recipients to understand why decryption context changed
- Third parties to audit key validity

### Fresh Keys Per Message

**Best practice**: Request a fresh engagement key for each message.

When Alice sends a message to Bob:

1. Alice requests a new engagement key from Bob's server
2. Server generates fresh key tagged with Bob's current vault generation
3. Alice encrypts message with the new shared secret
4. Alice stores the key locally for potential future verification

Benefits:

- Forward secrecy: Compromise of one message key doesn't expose others
- Automatic rotation detection: Fresh key request reveals if Bob has rotated
- Reduced window of exposure per key

Old engagement keys remain valid for decrypting their corresponding messages
until the underlying vault rotates.

### Recommended Rotation Schedule

**45 days** is the recommended vault rotation period.

This follows the industry trend toward shorter key lifetimes (Let's Encrypt
reduced TLS certificate validity from 90 to 45 days). Regular rotation:

- Limits exposure window if a key is compromised without detection
- Encourages good security hygiene
- Provides natural checkpoints for security review

**Client UX**:

- Display "Days since last rotation" in vault settings
- Show warning at 45 days: "Consider rotating your vault key"
- Show stronger warning at 90 days: "Your vault key is overdue for rotation"
- Never force rotation - user controls timing

### Rotation Protocol

When Alice rotates her vault at `alice@1.com`:

**Step 1: Create new vault**

1. Alice generates new vault with new key (generation N+1)
2. New vault has fresh secp256k1 keypair
3. Server assigns generation N+1 to new vault

**Step 2: Sign rotation attestation**

Alice's client signs a rotation proof with the **old** vault key:

```json
{
  "action": "vault_rotation",
  "name": "alice@1.com",
  "old_generation": 2,
  "new_generation": 3,
  "old_vault_pubkeyhash": "abc123...",
  "new_vault_pubkeyhash": "def456...",
  "timestamp": "2024-03-01T14:00:00Z",
  "signature": "sign(old_vault_private_key, ...)"
}
```

**Purpose**: This attestation is for Alice's own records. She can later verify
that she (holder of old key) authorized the rotation. It's not publicly
verifiable since the vault public key is never exposed.

**Step 3: Server updates state**

1. Server marks all generation-N engagement keys as expired
2. Server records expiration timestamp
3. Server begins issuing generation-(N+1) keys for new requests
4. Server retains expired key records indefinitely (for verification API)

**Step 4: Migrate secrets**

1. Alice exports secrets from old vault (decrypted with old key)
2. Alice imports secrets to new vault (encrypted with new key)
3. After verification, old vault key can be securely deleted

**Step 5: Counterparties discover rotation**

Counterparties learn of rotation on next interaction (pull model):

1. Carol tries to send message to Alice
2. Carol requests fresh engagement key from `1.com`
3. Server returns key tagged with generation 3
4. Carol's client notices generation changed from cached value
5. Carol's client warns: "Alice has rotated keys - establishing new secure
   channel"

### Counterparty Key Discovery Flow

When Alice wants to send to Bob after some time has passed:

**If Alice has cached Bob's engagement key**:

1. Alice's client calls verify-key API: "Is this key still valid?"
2. If `status: "active"` → proceed with cached key (or request fresh one)
3. If `status: "expired"` → Bob has rotated, request new key

**If Alice has no cached key**:

1. Alice requests fresh engagement key from Bob's server
2. Server returns key with current vault generation
3. Alice proceeds with key exchange

**Handling expired keys**:

- Old messages encrypted to expired keys remain decryptable (if Bob kept old
  vault access)
- New messages must use keys from current vault generation
- Client should prompt: "Bob rotated keys. Messages sent before [date] used old
  key."

### Trust Model

The public trusts server attestations about key ownership:

- Server is authoritative for "does this engagement key belong to alice@1.com?"
- Server is authoritative for "what is alice's current vault generation?"
- Users implicitly trust their chosen server provider

**If you don't trust your server, switch providers.** This is analogous to email

- if you don't trust your email provider, you use a different one.

**What servers can do** (if malicious):

- Lie about key ownership (claim a fake key belongs to Alice)
- Withhold messages
- Leak metadata about relationships

**What servers cannot do**:

- Read encrypted message contents
- Learn vault private keys
- Forge signatures from users

**Mitigation**: Choose reputable providers, or self-host.

### Self-Signed Rotation Proofs

The rotation attestation signed by the old vault key serves the user's own
verification needs:

- Alice can prove to herself that she authorized the rotation
- Useful for audit trails and dispute resolution
- Stored locally by Alice's client

This is **not** publicly verifiable because:

- The vault public key is never exposed to the public
- Only Alice and her server know the vault public key
- The signature can only be verified by parties who know the public key

For public verification of key ownership, rely on server attestations.

### Security Considerations for Rotation

**Servers must retain expired key history indefinitely**:

- Cannot delete records of old engagement keys
- Must be able to answer "was this key ever valid for this user?"
- Enables historical message verification

**Key pinning with generation awareness**:

- Clients store `(counterparty, engagement_key, vault_generation)`
- Generation change triggers rotation warning
- Prevents silent key substitution attacks

**Rotation during active conversation**:

- If Bob rotates mid-conversation with Alice:
- Alice's next message attempt discovers rotation
- Alice must establish new shared secret
- Old messages remain readable (if Alice cached old keys)

**Lost vault key scenario**:

- If Alice loses her vault key entirely, she cannot sign rotation attestation
- Alice must contact server to manually initiate rotation (identity verification
  required)
- Server marks old keys as expired without cryptographic proof
- This is a degraded security mode - server has more authority

## Message Format

### Encrypted Secret Payload

```json
{
  "version": 1,
  "from": "alice@1.com",
  "to": "bob@2.com",
  "engagement_key_id": "sha256(alice_engagement_pub + bob_engagement_pub)",
  "encrypted_payload": "base64(ACS2_encrypt(secret, shared_secret))",
  "signature": "base64(sign(encrypted_payload, alice_engagement_priv))",
  "timestamp": 1699900000
}
```

### Secret Types

The encrypted payload can contain any KeyPears secret type:

- Passwords
- API keys
- Cryptocurrency wallet keys
- SSH keys
- Arbitrary encrypted data

## API Endpoints

### Implemented Endpoints (orpc)

The DH key exchange is implemented via orpc procedures. For the full messaging
API, see [messages.md](./messages.md).

**Key Exchange Endpoints:**

| Procedure                      | Auth                    | Purpose                                                    |
| ------------------------------ | ----------------------- | ---------------------------------------------------------- |
| `getEngagementKeyForSending`   | Session token           | Create "send" engagement key for a counterparty            |
| `getCounterpartyEngagementKey` | PoW + Signature         | Get recipient's key (with three-layer verification)        |
| `verifyEngagementKeyOwnership` | Public                  | Cross-domain identity verification (pubkey → address)      |
| `getDerivationPrivKey`         | Session token           | Get derivation private key to derive engagement private key|
| `getEngagementKeyByPubKey`     | Session token           | Look up engagement key ID from public key                  |

**Messaging Endpoints:**

| Procedure                      | Auth                    | Purpose                                                    |
| ------------------------------ | ----------------------- | ---------------------------------------------------------- |
| `sendMessage`                  | Channel binding         | Send encrypted message (references consumed PoW)           |
| `getChannels`                  | Session token           | List channels for an address                               |
| `getChannelMessages`           | Session token           | Get messages in a channel                                  |
| `getSenderChannel`             | Session token           | Get/create sender's channel view                           |

**Security Model**: The implementation uses:
- **PoW** for DoS prevention (at key request time)
- **ECDSA signatures** for sender authentication (proves key ownership)
- **Cross-domain verification** for identity binding (confirms pubkey belongs to address)
- **Channel binding** for message send (PoW tied to specific sender+recipient pair)

## Future Enhancements

### Group Key Exchange

Extend the protocol for multi-party shared secrets:

- Team vaults
- Group messaging
- Threshold cryptography (k-of-n required to decrypt)

### Message Acknowledgments

Delivery receipts and read receipts:

- Cryptographically signed acknowledgments
- Optional (privacy-preserving)
- Enables reliable delivery guarantees

### Batched Message Delivery

Reduce metadata leakage through timing analysis:

- Batch messages across multiple senders
- Randomized delivery delays
- Tor-style onion routing (extreme privacy mode)

## Implementation Status

**Current**: ✅ Core DH key exchange with full identity verification is implemented

**Completed**:

1. ✅ Engagement key derivation in `@keypears/lib` (privateKeyAdd, publicKeyAdd)
2. ✅ Engagement key generation on API server (server-side key derivation)
3. ✅ Client-side key management (getEngagementKeyForSending, getDerivationPrivKey)
4. ✅ ECDH shared secret computation (ecdhSharedSecret in @keypears/lib)
5. ✅ ECDSA signing/verification (sign, verify in @keypears/lib)
6. ✅ Message encryption/decryption flow (ACS2 with ECDH shared secret)
7. ✅ Messaging UI in Tauri app (channels, compose, reply)
8. ✅ PoW-based DoS prevention (at key request time)
9. ✅ Signature-based sender authentication (sign PoW hash with engagement key)
10. ✅ Cross-domain identity verification (`verifyEngagementKeyOwnership` API)
11. ✅ Channel binding (PoW tied to sender+recipient pair)

**Not yet implemented**:

- Vault generation / key rotation (see "Vault Rotation" section - marked as future)
- Secret/password attachments (Phase 2)

## References

- [ECDH on secp256k1](https://en.bitcoin.it/wiki/Secp256k1)
- [BIP-32: Hierarchical Deterministic Wallets](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)
  (similar key derivation concepts)
- [Signal Protocol](https://signal.org/docs/) (inspiration for key exchange
  patterns)
- [KeyPears Vault Keys](./vault-keys.md)
- [KeyPears Key Derivation Functions](./kdf.md)
