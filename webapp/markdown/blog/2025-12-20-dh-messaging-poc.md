+++
title = "A Proof-of-Concept of a Diffie-Hellman-Based Messaging System for KeyPears"
date = "2025-12-20T12:00:00-06:00"
author = "KeyPears Team"
+++

KeyPears is a password manager, but its true foundation is something more
fundamental: a federated Diffie-Hellman key exchange protocol. Today, we're
announcing the completion of a proof-of-concept messaging system built on this
foundation—the first step toward secure password sharing between users.

## Why Build Messaging First?

To share a password from `alice@keypears.com` to `bob@example.com`, we need to:

1. Establish a shared secret between Alice and Bob (DH key exchange)
2. Encrypt the password with that shared secret
3. Deliver it securely to Bob's inbox
4. Sync it to Bob's vault across all his devices

That's essentially messaging with an attachment. So we started with plain text
messages. Once messaging works, adding password attachments is straightforward.

## The Privacy Challenge

Every KeyPears vault has a master key (a secp256k1 private key). The naive
approach would be to publish each vault's public key and let users compute
shared secrets via ECDH. But this is problematic:

- **Correlation**: Your public key becomes a global identifier linking all your
  relationships
- **Quantum risk**: A quantum computer could derive your private key from the
  public key, compromising everything at once
- **Metadata leakage**: Observers can see who you're communicating with based on
  which public keys you fetch

Our solution: generate unique "engagement keys" for each relationship. Alice and
Bob each get a relationship-specific keypair that reveals nothing about their
underlying vault keys.

## Server-Side Key Derivation: The Key Innovation

Here's the problem: Bob might be offline when Alice wants to message him. She
needs his public key, but Bob isn't there to generate it.

Our solution uses a mathematical property of elliptic curve cryptography: if you
add two private keys together, the result corresponds to adding the two public
keys together.

```
(privateKey_A + privateKey_B) * G = publicKey_A + publicKey_B
```

This enables server-assisted key generation:

1. Server generates random `derivationPrivKey` and computes `derivationPubKey`
2. Server adds Bob's vault public key:
   `engagementPubKey = vaultPubKey + derivationPubKey`
3. Server gives `derivationPrivKey` to Bob when he comes online
4. Bob computes: `engagementPrivKey = vaultPrivKey + derivationPrivKey`

The server never learns Bob's vault private key, yet can generate valid
engagement public keys on his behalf. Bob can derive the corresponding private
keys whenever he needs them.

## Spam Prevention with Proof-of-Work

Without spam controls, anyone could flood inboxes with garbage. We use the same
proof-of-work system as vault registration: every message requires solving a
computational puzzle.

The difficulty is configurable at three levels:

1. **Per-channel**: Set different difficulty for specific contacts (low for
   trusted friends)
2. **Per-vault**: Your global setting for unknown senders
3. **System default**: ~4 million hashes if nothing else is set

When you trust someone, you can lower their difficulty to make replies instant.
Spammers face the full difficulty—minutes of computation per message.

## Architecture: Per-Participant Channel Views

In a federated system, there's no central database. Alice's server
(`keypears.com`) and Bob's server (`example.com`) are completely separate. So
instead of a shared "channel" record, each participant has their own view:

```
Alice's server stores:
┌─────────────────────────────────────┐
│ channel_view                        │
│ owner: alice@keypears.com           │
│ counterparty: bob@example.com      │
│ secretId: "01JFX..." (for vault)    │
└─────────────────────────────────────┘

Bob's server stores:
┌─────────────────────────────────────┐
│ channel_view                        │
│ owner: bob@example.com             │
│ counterparty: alice@keypears.com    │
│ secretId: "01JFA..." (for vault)    │
└─────────────────────────────────────┘
```

Each user manages their own copy. The server-generated `secretId` ensures all of
Alice's devices see the same channel ID when syncing.

## No Server-Side Outbox

When Alice sends a message to Bob:

1. Alice's client connects directly to Bob's server
2. Message is stored in Bob's inbox
3. Alice saves her sent message to her own vault

Bob's server only sees incoming messages. Alice's server doesn't know who Alice
is messaging—she saves sent messages locally. This is more private than email,
where your outgoing mail server sees everything.

## The Complete Flow

Here's what happens when Alice sends a message to Bob:

```
1. Alice gets her engagement key (from her server, purpose: "send")
2. Alice requests Bob's engagement key (from Bob's server, purpose: "receive")
   → Bob's server returns the key + required PoW difficulty
3. Alice solves PoW challenge (WebGPU or WASM fallback)
4. Alice encrypts message with ECDH shared secret
5. Alice sends to Bob's server with PoW proof
6. Bob's server validates PoW and stores in inbox
7. Bob's sync service moves message from inbox to vault
8. Bob reads message (decrypted client-side)
```

## Implementation Details

The messaging system spans both the API server and the Tauri client:

**API Server (TypeScript/orpc)**:

- `getCounterpartyEngagementKey` - Public endpoint, returns recipient's key
- `sendMessage` - PoW-authenticated message delivery
- `getChannels` / `getChannelMessages` - Session-authenticated queries
- `getInboxMessagesForSync` / `deleteInboxMessages` - Vault sync integration

**Client (TypeScript/React)**:

- ECDH shared secret computation via `@keypears/lib`
- ACS2 encryption (AES-256-CBC + SHA-256-HMAC)
- WebGPU mining with WASM fallback
- Background sync to move inbox messages to vault

**Security Constants**:

- Default difficulty: 4 million hashes (~4 seconds on GPU)
- Max encrypted data size: 10KB per message
- Challenge expiration: 15 minutes

## What's Next

This proof-of-concept handles text messages. The next steps:

1. **Password attachments**: Attach secrets to messages for sharing
2. **Cross-domain testing**: Verify messaging between `keypears.com` and
   `example.com`
3. **Mobile support**: Test the full flow on Android and iOS

The foundation is solid. Messaging between addresses works. Now we build the
secret sharing features that will make KeyPears a truly collaborative password
manager.

## Try It Out

The messaging system is available in the latest KeyPears development build. You
can:

1. Create a vault at `name@keypears.com`
2. Navigate to Messages
3. Click "New Message" and enter a recipient address
4. Watch the PoW mining (your GPU will spin up briefly)
5. Send your message

The complete implementation is open source in our
[GitHub repository](https://github.com/keypears/keypears).

_KeyPears: Your secrets, everywhere, owned by you._
