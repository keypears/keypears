+++
title = "KeyPears Is Now Hybrid Post-Quantum"
date = "2026-04-26T13:30:00-06:00"
author = "Ryan X. Charles"
+++

KeyPears is now hybrid post-quantum.

That sentence is easy to write and easy to misunderstand. It does not mean
"quantum-proof." It does not mean cryptography is solved forever. It does not
mean a future standards committee, implementation bug, side-channel attack, or
protocol flaw can be ignored.

It means something narrower and more important: KeyPears no longer depends on
classical public-key cryptography alone. Messages now use both classical and
post-quantum key agreement. Signatures now use both classical and post-quantum
signing. The server still stores only ciphertext. The protocol still uses
federated `name@domain` addressing. But the cryptographic spine has changed.

The new design is:

| Purpose          | Classical algorithm | Post-quantum algorithm | Construction             |
| ---------------- | ------------------- | ---------------------- | ------------------------ |
| Signatures       | Ed25519             | ML-DSA-65              | Both signatures required |
| Message secrecy  | X25519              | ML-KEM-768             | Shared secrets combined  |
| Symmetric crypto | AES-256-GCM         | -                      | Authenticated encryption |
| Hash/KDF         | SHA-256             | -                      | HMAC, HKDF, PBKDF2       |

The short version: an attacker must defeat both halves of the hybrid
construction to forge a message or recover message plaintext.

## Why hybrid?

Public-key cryptography is where quantum computers matter most.

The symmetric pieces of KeyPears - AES-256-GCM, SHA-256, HMAC-SHA-256, and
PBKDF2-HMAC-SHA-256 - are not the urgent problem. Grover's algorithm changes
the security margin of symmetric primitives, but doubling key sizes is the
basic answer, and AES-256 already has that margin.

The classical public-key pieces are different. A large enough fault-tolerant
quantum computer would break the discrete-log assumptions behind elliptic-curve
cryptography. That includes the old P-256 design and the modern curves KeyPears
uses now, Ed25519 and X25519.

Post-quantum algorithms exist to address that. NIST standardized ML-KEM for
key encapsulation and ML-DSA for signatures. KeyPears now uses ML-KEM-768 and
ML-DSA-65.

So why not use only the post-quantum algorithms?

Because new cryptography is new. ML-KEM and ML-DSA have been through years of
analysis and standardization, but they do not have the same multi-decade
deployment history as elliptic-curve cryptography. Hybrid designs avoid a
false choice. We do not have to bet everything on the old algorithms, and we do
not have to bet everything on the new ones.

Hybrid gives the conservative answer:

- If elliptic curves fall to quantum computers, the post-quantum half still
  protects the protocol.
- If a serious weakness is found in the post-quantum half, the classical half
  still protects the protocol.
- If both remain sound, the construction is stronger than either alone.

That is the kind of tradeoff KeyPears should make. The goal is not novelty. The
goal is defensibility.

## How message encryption works now

When Alice sends a message to Bob, KeyPears derives the message encryption key
from two independent shared secrets.

First, Alice performs a classical X25519 Diffie-Hellman exchange with Bob's
X25519 public key:

```text
x25519_shared_secret = X25519(alice_private, bob_public)
```

Then Alice performs an ML-KEM-768 encapsulation to Bob's ML-KEM public key:

```text
(mlkem_ciphertext, mlkem_shared_secret) = ML-KEM-768.Encaps(bob_encap_public_key)
```

Those two shared secrets are concatenated and passed through HKDF-SHA-256:

```text
combined = x25519_shared_secret || mlkem_shared_secret
message_key = HKDF-SHA-256(combined, context)
```

The result is used with AES-256-GCM to encrypt the message.

This matters because the final AES key is not "the X25519 key" and it is not
"the ML-KEM key." It is derived from both. Breaking only X25519 is not enough.
Breaking only ML-KEM is not enough. An attacker needs both shared secrets to
recover the message key.

The context also binds the sender and recipient addresses. The ciphertext is
not a free-floating blob that can be silently moved into another conversation.

KeyPears also encrypts a sender copy of the same message so the sender can read
their own sent-message history. That copy uses the same hybrid construction,
but targets the sender's own retained key set.

## How signatures work now

Every message is signed with a composite Ed25519 + ML-DSA-65 signature.

The signed object is not just the text. It is a canonical, length-prefixed
envelope covering:

- Sender address
- Recipient address
- Sender Ed25519 public key
- Sender ML-DSA public key
- Sender X25519 public key
- Recipient X25519 public key
- Recipient ML-KEM public key
- Recipient ciphertext
- Sender ciphertext

Both algorithms sign the same envelope independently. Verification requires
both signatures to be valid.

That gives the same hybrid shape as encryption. A classical-only forgery is not
enough. A post-quantum-only forgery is not enough. The recipient accepts the
message only if the Ed25519 signature and the ML-DSA-65 signature both verify
over the exact same bytes.

This also protects the key material inside the message envelope. An attacker
cannot swap in a different X25519 key, ML-KEM key, ciphertext, or recipient
address without invalidating the signature.

## What changed for users?

Mostly nothing visible.

You still have a KeyPears address like `alice@example.com`. You still log in
with your password. You still send messages and store secrets in the vault. If
you claim a domain, federation still works through `/.well-known/keypears.json`
and the KeyPears API.

Under the hood, each account now has four private keys instead of one or two:

- Ed25519 signing key
- X25519 private key
- ML-DSA-65 signing key
- ML-KEM-768 decapsulation key

All four private keys are encrypted client-side with AES-256-GCM under the
user's encryption key. The encryption key is derived from the user's password
and never leaves the client. The server stores encrypted private keys, public
keys, ciphertext, and metadata required for routing and search. It does not get
the keys needed to decrypt message or vault contents.

The tradeoff is size. ML-DSA and ML-KEM keys and signatures are much larger
than elliptic-curve keys and signatures. That means larger messages, more bytes
in the database, and more bandwidth during federation.

For KeyPears, that is a good trade. We are not streaming video. We are sending
messages, credentials, and notes. A few extra kilobytes per message is worth
the security margin and the migration path.

## What this does not solve

Hybrid post-quantum cryptography is not a force field.

It does not protect you if your device is compromised while you are logged in.
An attacker with access to the decrypted private keys or cached encryption key
can read what that device can read.

It does not add forward secrecy to stored KeyPears messages. KeyPears stores
messages so users can recover history across devices and key rotations. If a
retained private key is compromised later, messages encrypted to that key may
be decryptable. TLS provides forward secrecy for transport, but KeyPears does
not currently run a Signal-style ratchet for stored application-layer
ciphertext. That is a deliberate simplicity tradeoff, not something this change
pretends to erase.

It does not eliminate metadata. Servers still need enough information to route
messages, enforce proof of work, manage accounts, and support federation.

It does not make implementation bugs impossible. A hybrid protocol is only as
good as the code that generates keys, signs envelopes, verifies signatures,
derives message keys, checks ciphertext authentication tags, and handles
rotation. That is why the protocol keeps the construction small and the
documentation explicit.

## Why this is the right direction

KeyPears is trying to build an email-shaped protocol for encrypted messaging
and secret storage. Email survived because addresses were human-readable,
domains were federated, and anyone could implement the protocol. It failed at
confidentiality because encryption and key exchange were optional add-ons.

KeyPears makes encryption mandatory. Now it makes post-quantum readiness part
of that baseline.

The important phrase is "part of the baseline." This is not an enterprise add-on,
not a compatibility mode, not a flag for cautious users. Every new KeyPears
message uses the hybrid construction. Every message signature is composite.
Every account key set includes both classical and post-quantum keys.

That is how protocol security should work. The safest path should be the normal
path.

## Where we land

The previous KeyPears alpha launch post described a P-256-based system. That
was the right place to start: simple, NIST-standard, widely deployed, easy to
review. But the protocol has moved forward.

KeyPears now uses:

- Ed25519 + ML-DSA-65 for composite signatures
- X25519 + ML-KEM-768 for hybrid message encryption
- AES-256-GCM for authenticated encryption
- SHA-256, HMAC-SHA-256, HKDF-SHA-256, and PBKDF2-HMAC-SHA-256 for hashing and
  derivation
- Proof of work for spam resistance
- TLS for transport security between federated servers

This is a better design than the one we launched with. It is more future-aware
without becoming exotic. It adopts the post-quantum algorithms that standards
bodies and cryptographic reviewers expect, while keeping classical algorithms
in the loop until the new ones have earned the same deployment history.

The result is not perfect security. Perfect security does not exist. The result
is a protocol that is easier to defend, easier to explain, and better aligned
with where public-key cryptography is going.

That is the bar KeyPears should be trying to clear.
