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
- Bob can verify correctness: `publicKeyCreate(engagement_priv) == engagement_pub`

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

- Store `(counterparty, engagement_public_key)` locally
- Warn user if key changes unexpectedly
- Require explicit confirmation for key rotation

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
       Register a new engagement key for a relationship

GET    /api/vaults/{username}/engagement-keys/{relationship}
       Get engagement public key for a specific relationship

POST   /api/vaults/{username}/verify-engagement-key
       Verify an engagement key belongs to a user

POST   /api/vaults/{username}/messages
       Deliver an encrypted message to a user

GET    /api/vaults/{username}/messages
       Retrieve pending encrypted messages

DELETE /api/vaults/{username}/messages/{message_id}
       Acknowledge receipt of a message
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

### Key Rotation

Enable periodic key rotation while maintaining relationships:

- Generate new engagement keys
- Re-encrypt active relationships
- Tombstone old keys with forward secrecy

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
