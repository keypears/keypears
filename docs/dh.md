# Diffie-Hellman Key Exchange Protocol

This document describes KeyPears' federated Diffie-Hellman (DH) key exchange
protocol, which enables end-to-end encrypted communication between any two
email-style addresses across different domains.

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

**Alice's client → Bob's server (`2.com`)**:

1. Alice's client sends a signed request to `2.com`:
   - "I am Alice (`alice@1.com`), here is my engagement public key for Bob"
   - Request is signed with Alice's engagement private key
2. Bob's server needs to verify this is really Alice

**Bob's server (`2.com`) → Alice's server (`1.com`)**:

1. Bob's server asks Alice's server: "Does this public key really belong to
   Alice for the Alice↔Bob engagement?"
2. Alice's server verifies and responds: "Yes, this is Alice's valid engagement
   key"

**Bob's server generates Bob's engagement key**:

1. Server uses the key addition property to generate a derived public key for
   Bob
2. This derived key is specific to the Alice↔Bob relationship
3. Server stores the mapping and returns Bob's engagement public key to Alice

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

The server needs to generate engagement keys for users without knowing their
vault private keys. Here's how:

### When Bob's Server Generates Bob's Engagement Key

1. Server generates a random keypair: `(random_priv, random_pub)`
2. Server adds `random_pub` to Bob's vault public key:
   `engagement_pub = bob_vault_pub + random_pub`
3. Server stores `random_priv` encrypted to Bob (for later retrieval)
4. Server returns `engagement_pub` to the requester

### When Bob Unlocks His Vault

1. Bob's client retrieves `random_priv` from server
2. Bob computes: `engagement_priv = bob_vault_priv + random_priv`
3. Bob now has the private key corresponding to `engagement_pub`

**Security properties**:

- Server never learns `bob_vault_priv`
- Server only stores `random_priv`, which is useless without `bob_vault_priv`
- Bob can verify correctness:
  `publicKeyCreate(engagement_priv) == engagement_pub`

## Server-Side Key Management

The server needs its own private keys for deriving engagement keys. These
**derivation keys** must be carefully managed: rotated periodically, never
deleted, and tracked so the correct key is used for re-derivation.

### Derivation Key Storage

Derivation keys are stored as environment variables using an incrementing index
pattern:

```
DERIVATION_PRIVKEY_1=<hex-encoded 32-byte private key>
DERIVATION_PRIVKEY_2=<hex-encoded 32-byte private key>
DERIVATION_PRIVKEY_3=<hex-encoded 32-byte private key>
```

These are stored in `.env.*` files encrypted with `dotenvx`. Each key appears as
a separate line, making diffs readable and auditable.

**Why this pattern**:

- **Human-readable diffs**: Easy to see when a new key was added
- **Simple rotation**: Add `DERIVATION_PRIVKEY_N+1`, redeploy
- **No parsing complexity**: Each key is a simple hex string
- **Clear audit trail**: The index indicates key generation order
- **Self-hosting friendly**: No external dependencies (KMS, HSM, etc.)

### Key Selection on Server Boot

When the server starts, it loads all derivation keys and identifies the current
one:

```typescript
function loadDerivationKeys(): {
  keys: Map<number, FixedBuf<32>>;
  currentIndex: number;
} {
  const keys = new Map<number, FixedBuf<32>>();

  for (let i = 1; ; i++) {
    const keyHex = process.env[`DERIVATION_PRIVKEY_${i}`];
    if (!keyHex) break;
    keys.set(i, FixedBuf.fromHex(32, keyHex));
  }

  if (keys.size === 0) {
    throw new Error("No derivation keys found. Set DERIVATION_PRIVKEY_1.");
  }

  const currentIndex = Math.max(...keys.keys());
  return { keys, currentIndex };
}
```

**Rules**:

- Keys must be numbered sequentially starting from 1 (no gaps)
- The highest-numbered key is the "current" key for new derivations
- All keys are kept in memory for re-derivation of historical engagement keys

### Tracking Derivation Key Usage

When the server derives an engagement key, it records which derivation key was
used:

```typescript
// Database schema for engagement keys
engagement_keys: {
  id: ulid(),
  username: "bob",
  engagement_public_key: "02abc...",
  encrypted_random_private: "...",
  derivation_key_index: 2,        // Used DERIVATION_PRIVKEY_2
  vault_generation: 3,
  initiator_address: "alice@1.com",
  created_at: timestamp,
}
```

When re-deriving (e.g., Bob retrieves his engagement private key), the server
uses the same derivation key index that was originally used:

```typescript
function recomputeEngagementKey(engagementKeyRecord: EngagementKey): FixedBuf<33> {
  const derivationKey = derivationKeys.get(engagementKeyRecord.derivation_key_index);
  if (!derivationKey) {
    throw new Error(`Missing derivation key ${engagementKeyRecord.derivation_key_index}`);
  }
  // Use derivationKey to recompute...
}
```

### Key Rotation Schedule

**Recommended rotation**: Every 90 days for server operators.

This is longer than the 45-day vault rotation recommendation because:

- Server keys protect many users, so rotation is more operationally complex
- The derivation key is never exposed publicly (unlike engagement keys)
- Old keys must be retained indefinitely anyway

**Rotation process**:

1. Generate new 32-byte random key
2. Add to `.env.*` as `DERIVATION_PRIVKEY_N+1`
3. Encrypt with `dotenvx`
4. Deploy (server will automatically use the new key for new derivations)
5. Old keys remain for historical re-derivation

### Key Retirement (Optional)

Old keys can never be deleted (needed for re-derivation), but operators can mark
keys as retired to prevent accidental use:

```
DERIVATION_PRIVKEY_1=abc123...
DERIVATION_PRIVKEY_1_RETIRED=true
DERIVATION_PRIVKEY_2=def456...
```

The server can warn if the current key is marked retired (misconfiguration).

### Startup Validation

The server should validate derivation keys on boot:

```typescript
function validateDerivationKeys(keys: Map<number, FixedBuf<32>>): void {
  // Check for gaps
  const indices = [...keys.keys()].sort((a, b) => a - b);
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== i + 1) {
      throw new Error(`Gap in derivation keys: missing DERIVATION_PRIVKEY_${i + 1}`);
    }
  }

  // Warn if only one key (rotation overdue)
  if (keys.size === 1) {
    console.warn("Only one derivation key configured. Consider adding a rotation.");
  }
}
```

### Environment Separation

Development and production use separate `.env.*` files with different keys:

- `.env.development`: `DERIVATION_PRIVKEY_1`, `DERIVATION_PRIVKEY_2`, ...
- `.env.production`: `DERIVATION_PRIVKEY_1`, `DERIVATION_PRIVKEY_2`, ...

The same index (e.g., `1`) refers to different actual keys in each environment.
This is safe because:

- Dev and production databases are completely separate
- Engagement keys are never migrated between environments
- The index is only meaningful within a single environment

### Security Considerations

**Never delete derivation keys**: Even after rotation, old keys are needed to
re-derive historical engagement keys. Deleting a key would break all engagement
keys that used it.

**Protect `.env.*` files**: These contain the server's most sensitive secrets.
Use `dotenvx` encryption and restrict access.

**No key material in logs**: Never log derivation keys or derived values.

**Backup strategy**: Ensure derivation keys are backed up securely. Loss of
these keys would break all engagement key re-derivation.

## Engagement Key Derivation

### Deterministic Client-Side Generation

For the initiating party (Alice), engagement keys should be deterministically
derived to ensure consistency:

```typescript
function deriveEngagementKey(
  vaultPrivateKey: FixedBuf<32>,
  myAddress: string,
  theirAddress: string
): FixedBuf<32> {
  // Canonical ordering to ensure Alice→Bob and Bob→Alice use same identifier
  const [addr1, addr2] = [myAddress, theirAddress].sort();
  const relationshipId = sha256Hash(`${addr1}:${addr2}`);

  // Derive engagement private key
  return sha256Hmac(relationshipId, vaultPrivateKey);
}
```

### Server-Side Generation for Recipient

When the server generates an engagement key for the recipient:

```typescript
function generateEngagementKeyForRecipient(
  recipientVaultPublicKey: FixedBuf<33>,
  initiatorAddress: string,
  recipientAddress: string
): {
  engagementPublicKey: FixedBuf<33>;
  encryptedRandomPrivate: WebBuf;
} {
  // Generate random component
  const randomPrivate = secureRandom(32);
  const randomPublic = publicKeyCreate(randomPrivate);

  // Add to recipient's vault public key
  const engagementPublicKey = publicKeyAdd(recipientVaultPublicKey, randomPublic);

  // Encrypt random component for recipient to retrieve later
  // (encrypted with a key only the recipient can derive)
  const encryptedRandomPrivate = encryptForRecipient(randomPrivate, ...);

  return { engagementPublicKey, encryptedRandomPrivate };
}
```

## Verification Protocol

### Cross-Domain Key Attestation

When `2.com` receives a request claiming to be from `alice@1.com`:

**Request from Alice's client to Bob's server**:

```json
{
  "from": "alice@1.com",
  "to": "bob@2.com",
  "engagement_public_key": "02abc123...",
  "signature": "304402...",
  "timestamp": 1699900000
}
```

**Bob's server verifies with Alice's server**:

```
GET https://1.com/api/vaults/alice/verify-engagement-key
?for=bob@2.com
&key=02abc123...
```

**Alice's server responds**:

```json
{
  "valid": true,
  "registered_at": 1699900000,
  "signature": "server_attestation_signature"
}
```

### Signature Verification

Alice's client signs the initial request with her engagement private key. Bob's
server can verify:

1. The signature is valid for the claimed engagement public key
2. Alice's server attests this key belongs to Alice for the Alice↔Bob
   relationship

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

### Required Server Endpoints

Each KeyPears-compatible server must implement:

```
POST   /api/vaults/{username}/engagement-keys
       Register a new engagement key for a relationship (authenticated)

GET    /api/vaults/{username}/engagement-keys/{relationship}
       Get engagement public key for a specific relationship (public)

GET    /api/vaults/{username}/verify-key?key={engagement_public_key}
       Check if an engagement key is active, expired, or unknown (public)
       Returns: { status, vault_generation, registered_at, expired_at? }

POST   /api/vaults/{username}/verify-engagement-key
       Cross-domain verification: confirm key belongs to user (public)
       Used by remote servers during key exchange

POST   /api/vaults/{username}/messages
       Deliver an encrypted message to a user (public, but signed)

GET    /api/vaults/{username}/messages
       Retrieve pending encrypted messages (authenticated)

DELETE /api/vaults/{username}/messages/{message_id}
       Acknowledge receipt of a message (authenticated)

GET    /api/vaults/{username}/generation
       Get current vault generation number (public)
```

### OpenAPI Compatibility

All endpoints are designed to be OpenAPI-compatible for:

- Easy integration with existing tooling
- Automatic client generation
- Standardized error handling

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

**Current**: Protocol design phase

**Next steps**:

1. Implement engagement key derivation in `@keypears/lib`
2. Add engagement key registration to API server
3. Implement cross-domain verification
4. Build client-side key management
5. Create message encryption/decryption flow
6. Add sharing UI to Tauri app

## References

- [ECDH on secp256k1](https://en.bitcoin.it/wiki/Secp256k1)
- [BIP-32: Hierarchical Deterministic Wallets](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)
  (similar key derivation concepts)
- [Signal Protocol](https://signal.org/docs/) (inspiration for key exchange
  patterns)
- [KeyPears Cryptography Patterns](./crypto.md)
