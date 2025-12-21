+++
title = "Proving Who You Are: Sender Verification in Federated Messaging"
date = "2025-12-21T12:00:00-06:00"
author = "KeyPears Team"
+++

In our [previous post](/blog/2025-12-20-dh-messaging-poc), we introduced
KeyPears' DH-based messaging system—the foundation for secure password sharing
between users. We showed how engagement keys, server-side derivation, and
proof-of-work come together to enable private, spam-resistant messaging across
federated servers.

But there was a security gap we didn't address: **sender verification**. When
Alice requests Bob's engagement key, how does Bob's server know it's actually
Alice asking? Today, we're announcing our solution: a three-layer verification
system that proves sender identity without requiring a central authority.

## The Problem: Identity in a Federated World

In a centralized messaging system, identity is simple. WhatsApp knows who you
are because you signed up with your phone number. Signal has your registration.
The server is the authority.

KeyPears is federated. Alice's server (`keypears.com`) and Bob's server
(`example.com`) are completely separate—they don't share a database, they don't
share users, they might not even know each other exists. So when someone
contacts Bob's server claiming to be `alice@keypears.com`, how can Bob's server
verify that claim?

Without verification, an attacker could:

1. Claim to be Alice when requesting Bob's engagement key
2. Get Bob's server to create a key for "Alice" (actually the attacker)
3. Intercept Bob's responses and read his encrypted messages

This is classic impersonation. The attacker didn't break any cryptography—they
just lied about who they were, and nobody checked.

## Why Traditional Solutions Don't Fit

**Certificate Authorities?** They require a centralized trust hierarchy. The
whole point of KeyPears is that you can run your own server without asking
permission from anyone.

**Web of Trust?** Requires users to manually verify each other's keys. Great for
PGP power users, terrible for a password manager that needs to just work.

**Phone number verification?** Ties identity to a phone carrier. Not
everyone has a phone number, and phone numbers can be ported or SIM-swapped.

What we need is something that:

- Works across any two servers without prior coordination
- Proves cryptographic ownership, not just claimed identity
- Doesn't require user interaction beyond normal messaging
- Can't be bypassed by network attackers

## The Solution: Three Layers of Trust

Our sender verification uses three independent layers, each catching different
attack types:

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Proof-of-Work                                          │
│ → Prevents DoS attacks before any verification happens          │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: ECDSA Signature                                        │
│ → Proves sender owns the private key for their claimed pubkey   │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3: Cross-Domain Verification                              │
│ → Confirms the pubkey actually belongs to the claimed address   │
└─────────────────────────────────────────────────────────────────┘
```

Each layer is necessary. PoW alone doesn't prove identity. Signatures alone
don't prove address ownership. Cross-domain verification alone is vulnerable to
DoS. Together, they create a verification system that's both secure and
practical.

## Layer 1: Proof-of-Work

Before any verification happens, the sender must solve a computational puzzle.
This isn't about identity—it's about preventing resource exhaustion.

Without PoW, an attacker could spam Bob's server with millions of fake
verification requests, forcing it to make millions of cross-domain calls. The
server would be so busy checking fake requests that legitimate users couldn't
get through.

PoW ensures every verification request costs real computational work. Attackers
can't flood the system without burning significant resources.

**Implementation**: Same PoW system as vault registration—configurable
difficulty at the system, vault, or channel level. Users you trust can have
lower difficulty. Unknown senders face the full 4-million-hash default.

## Layer 2: Signature Verification

After PoW, the sender provides a signature over the solved hash using their
engagement private key. Bob's server verifies this signature against the
sender's claimed public key.

Why does this matter? Anyone can copy a public key. If Alice publishes her
engagement pubkey somewhere, Mallory could claim to be Alice and provide Alice's
pubkey. Without signature verification, Bob's server would have no way to
know it wasn't actually Alice.

The signature proves the sender possesses the private key corresponding to their
claimed public key. Only Alice has her private key, so only Alice can produce
valid signatures.

**Implementation**: Standard ECDSA signature over the 32-byte solved PoW hash.
The signature binds the identity claim to the PoW proof—you can't solve PoW as
yourself and then claim to be someone else.

## Layer 3: Cross-Domain Verification

Here's the key innovation. Even with a valid signature, we only know the sender
owns *some* private key. We don't know if that key actually belongs to
`alice@keypears.com`.

So Bob's server asks Alice's server directly:

```
Bob's server → Alice's server:
"Does public key 02abc123... belong to alice@keypears.com?"

Alice's server → Bob's server:
"Yes" or "No"
```

This is the cross-domain verification call. It works because:

1. Alice's server is the authority for `@keypears.com` addresses
2. Alice registered her engagement key with her own server
3. Her server can confirm the key belongs to her vault

**Critical detail**: Only "send" purpose keys are verified. When Alice creates
an engagement key for messaging Bob, it's marked with `purpose: "send"`. Keys
created by recipients (when someone requests your key) are marked `purpose:
"receive"`.

Why does this matter? If an attacker requested Bob's key while claiming to be
Alice, Bob's server would create a "receive" key for this fake-Alice. If
cross-domain verification accepted receive keys, the attacker could point to
this key as "proof" of being Alice. By only accepting "send" keys (which the
owner creates themselves), we ensure only Alice can prove she's Alice.

## Channel Binding: Preventing Replay

After all three layers pass, Bob's server stores "channel binding" information
on the consumed PoW challenge:

- Sender address: `alice@keypears.com`
- Recipient address: `bob@example.com`
- Sender public key: `02abc123...`

When Alice later sends an actual message (using `sendMessage`), the server
verifies these fields match. This prevents replay attacks—an attacker can't
take Alice's verified PoW proof and use it to send messages from a different
address or with a different key.

## The Complete Verification Flow

Here's what happens when Alice messages Bob for the first time:

```
Alice                      Alice's Server    Bob's Server
  │                              │                │
  ├─ Create engagement key ──────→                │
  │  (purpose: "send")           │                │
  │                              │                │
  ├─ Request PoW challenge ──────────────────────→
  │                              │                │
  ├─ Solve PoW                   │                │
  │                              │                │
  ├─ Sign solved hash            │                │
  │                              │                │
  ├─ Request Bob's key ──────────────────────────→
  │  + PoW proof                 │                │
  │  + signature                 │                │
  │  + claim: "I'm alice@..."    │                │
  │                              │                │
  │                              │   ┌────────────┤
  │                              │   │ 1. Verify PoW
  │                              │   │ 2. Verify signature
  │                              │   │ 3. Cross-domain:
  │                              │   └────────────┤
  │                              │                │
  │                          ←───────────────────┤
  │                   "Does 02abc... belong       │
  │                    to alice@keypears.com?"   │
  │                              │                │
  │                              ├───────────────→
  │                              │  "Yes"         │
  │                              │                │
  │                              │   ┌────────────┤
  │                              │   │ Create key
  │                              │   │ Store binding
  │                              │   └────────────┤
  │                              │                │
  │←─────────────────────────────────────────────┤
  │          Bob's engagement pubkey             │
```

If any layer fails—invalid PoW, bad signature, or failed cross-domain check—the
request is rejected and no key is created.

## Security Properties

**What the system provides:**

- **No impersonation**: Attacker must produce valid signature with sender's
  private key
- **No spoofing**: Cross-domain verification confirms key belongs to claimed
  address
- **No DoS**: PoW required before any verification work happens
- **No replay**: Channel binding ties PoW to specific sender/recipient/pubkey
- **No storage exhaustion**: Same sender+pubkey returns existing key
  (idempotent)

**What the system does NOT provide:**

- **Forward secrecy per relationship**: Same engagement keys can be reused
  (mitigated by using fresh keys for sensitive conversations)
- **Metadata hiding**: Servers see who messages whom and when (encryption hides
  content, not metadata)

## Implementation

The verification system required two new components:

**New endpoint: `verifyEngagementKeyOwnership`**

A public endpoint that answers "does this pubkey belong to this address?" Returns
only a boolean—no information leakage about non-existent keys or vaults.

**Modified: `getCounterpartyEngagementKey`**

Now performs all three verification layers before creating any keys. The flow
is: verify PoW → verify signature → call sender's server → store channel binding
→ create key.

We also added 21 security tests covering:

- Valid/invalid signatures
- Cross-domain verification edge cases
- Channel binding validation
- PoW replay prevention
- Idempotent key creation

All tests pass, and the full verification system is live in the latest
development build.

## What's Next

With sender verification complete, the messaging foundation is solid. Next up:

1. **Encrypted payloads**: Attach passwords and secrets to messages
2. **Secret sharing UI**: Share credentials with team members
3. **Cross-domain integration tests**: Verify everything works between different
   KeyPears servers

The pieces are coming together. Secure, federated messaging with cryptographic
identity verification—no central authority required.

_KeyPears: Your secrets, everywhere, owned by you._
