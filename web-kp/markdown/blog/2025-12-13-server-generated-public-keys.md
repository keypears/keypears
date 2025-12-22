+++
title = "Server-Generated Public Keys: How KeyPears Keeps Private Keys Client-Side"
date = "2025-12-13T06:00:00-06:00"
author = "KeyPears Team"
+++

**Note:** KeyPears is a work-in-progress open-source password manager and
cryptocurrency wallet. The design decisions described here represent our
development approach and may evolve before our official release.

This week we shipped the key derivation system that powers KeyPears' upcoming
Diffie-Hellman key exchange. It solves a fundamental problem: how can a server
generate public keys for users while ensuring only the user can derive the
corresponding private keys?

This post explains the mathematics, the implementation, and why this matters for
federated secret sharing.

## The Problem: Offline Key Generation

Imagine Alice wants to send an encrypted secret to Bob. She needs Bob's public
key to establish a shared secret via Diffie-Hellman. But Bob is offline—maybe
he's on a plane, or his phone is dead, or he simply hasn't opened the app in
days.

In a centralized system, this is easy: the server stores Bob's public key and
hands it to Alice. But KeyPears is designed so that servers never learn users'
private keys. The server knows Bob's vault public key, but we don't want to
expose that directly—doing so would enable correlation across all of Bob's
relationships and create a single point of failure if that key were ever
compromised.

We need the server to generate a fresh, unique public key for each relationship
(Alice↔Bob, Carol↔Bob, etc.) while ensuring:

1. Only Bob can derive the corresponding private key
2. The server never learns Bob's vault private key
3. Each derived key is cryptographically isolated

How do we square this circle?

## The Key Mathematical Property

The answer lies in a beautiful property of elliptic curve cryptography. On the
secp256k1 curve (the same one Bitcoin uses), there's a generator point `G`. Any
private key `a` has a corresponding public key `A = a * G` (scalar
multiplication).

Here's the critical insight:

**If you add two private keys together, the result corresponds to adding their
public keys together.**

```
Given:
  Private key a → Public key A (where A = a * G)
  Private key b → Public key B (where B = b * G)

Then:
  (a + b) * G = A + B
```

This means we can construct a derived keypair by addition:

- **Derived public key** = Vault public key + Derivation public key
- **Derived private key** = Vault private key + Derivation private key

The server knows the vault public key and can generate the derivation keypair.
So the server can compute the derived public key. But only Bob knows his vault
private key, so only Bob can compute the derived private key.

## Three Entropy Sources

KeyPears combines three sources of entropy to generate derived keys:

**1. Server Entropy** (from `DERIVATION_ENTROPY_N` environment variables)

The server maintains one or more 32-byte entropy values, numbered sequentially.
The highest-numbered entropy is used for new keys; older entropy is retained for
re-derivation. This enables rotation: add `DERIVATION_ENTROPY_2`, and new keys
use it while old keys remain derivable.

**2. DB Entropy** (random 32 bytes per derived key)

Each derived key gets fresh random entropy, stored in the database. This ensures
every key is unique, even for the same user. Compromise of one key's entropy
doesn't help attack others.

**3. Vault Key** (user's master private key)

The user's 32-byte secp256k1 private key never leaves their device. It's the
"secret ingredient" that only the client possesses. The server knows the
corresponding public key but can't reverse it.

## The Cryptographic Flow

### Server-Side: Generate Derived Public Key

When Alice requests a key for Bob, Bob's server performs:

```
1. db_entropy = random(32 bytes)
2. derivation_privkey = HMAC-SHA256(key: server_entropy, data: db_entropy)
3. derivation_pubkey = derivation_privkey * G
4. derived_pubkey = vault_pubkey + derivation_pubkey
```

The server stores `db_entropy` and `server_entropy_index` in the database, then
returns `derived_pubkey` to Alice. Alice can now encrypt to Bob using this
public key.

### Client-Side: Derive Private Key

When Bob comes online and needs to decrypt Alice's message:

```
1. Bob requests derivation_privkey from server
2. Server recomputes: derivation_privkey = HMAC-SHA256(server_entropy, db_entropy)
3. Server returns derivation_privkey to Bob
4. Bob computes: derived_privkey = vault_privkey + derivation_privkey
5. Bob verifies: derived_privkey * G == derived_pubkey
```

The verification step ensures nothing went wrong. If the derived public key
matches, Bob knows he has the correct private key and can proceed with
decryption.

## Code Examples with @webbuf Packages

KeyPears uses the `@webbuf` family of packages for cryptographic operations.
These are Rust implementations compiled to WebAssembly, providing both memory
safety and cross-platform consistency.

### Deriving the Derivation Private Key

The server computes the derivation private key using HMAC-SHA256:

```typescript
import { sha256Hmac } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";

function deriveDerivationPrivKey(
  serverEntropy: FixedBuf<32>,
  dbEntropy: FixedBuf<32>,
): FixedBuf<32> {
  return sha256Hmac(serverEntropy.buf, dbEntropy.buf);
}
```

HMAC provides domain separation: even if an attacker knew `db_entropy`, they
couldn't compute `derivation_privkey` without `server_entropy`.

### Computing Public Keys

The server derives the derivation public key and adds it to the vault public
key:

```typescript
import { publicKeyCreate, publicKeyAdd } from "@webbuf/secp256k1";

// derivation_pubkey = derivation_privkey * G
const derivationPubKey = publicKeyCreate(derivationPrivKey);

// derived_pubkey = vault_pubkey + derivation_pubkey
const derivedPubKey = publicKeyAdd(vaultPubKey, derivationPubKey);
```

### Client-Side Private Key Addition

When the user needs the derived private key:

```typescript
import { privateKeyAdd, publicKeyCreate } from "@webbuf/secp256k1";

// derived_privkey = vault_privkey + derivation_privkey
const derivedPrivKey = privateKeyAdd(vaultPrivKey, derivationPrivKey);

// Verify: derived_privkey * G should equal derived_pubkey
const verifyPubKey = publicKeyCreate(derivedPrivKey);
if (verifyPubKey.toHex() !== derivedPubKey.toHex()) {
  throw new Error("Derived key verification failed");
}
```

The verification step is crucial. It confirms that the addition was performed
correctly and that all parties agree on the final keypair.

## Connection to Diffie-Hellman Key Exchange

This key derivation system is the foundation for KeyPears' federated
Diffie-Hellman key exchange. Here's how the pieces fit together:

**Per-Relationship Keys:** When Alice wants to communicate with Bob, Bob's
server generates a derived key specifically for the Alice↔Bob relationship. This
key is mathematically linked to Bob's vault key but reveals nothing about it.

**Privacy Isolation:** If an attacker compromises the Alice↔Bob derived key,
they learn nothing about Bob's vault key or his keys for other relationships.
Each relationship is cryptographically isolated.

**Offline Operation:** Alice can initiate contact with Bob even when Bob is
offline. The server provides Bob's derived public key immediately. Bob derives
the matching private key whenever he comes online.

**Quantum Resistance:** By never exposing the primary vault public key, we limit
the attack surface. A quantum computer would need to target each derived key
individually rather than compromising all relationships at once.

The full Diffie-Hellman protocol builds on this: Alice and Bob each get derived
keys for their relationship, compute a shared secret via ECDH, and use that
secret to encrypt communications. The servers coordinate but never see plaintext.

## Security Properties

**Server Never Learns Vault Private Key**

The server knows `vault_pubkey`, `derivation_privkey`, and `derived_pubkey`. But
computing `vault_privkey` would require solving the discrete logarithm
problem—computationally infeasible on secp256k1.

**Per-Key Entropy Isolation**

Each derived key uses fresh `db_entropy`. Even if an attacker compromised the
database and obtained all `db_entropy` values, they'd still need `server_entropy`
to compute any `derivation_privkey`. And even with both, they'd need
`vault_privkey` to compute `derived_privkey`.

**Entropy Rotation Limits Blast Radius**

Server entropy rotates periodically (we recommend every 90 days). Each derived
key records which entropy index was used. If entropy N is somehow compromised,
only keys using index N are affected—and the attacker still needs per-key
`db_entropy` and user `vault_privkey`.

**Verification Prevents Subtle Attacks**

The client always verifies that `derived_privkey * G == derived_pubkey`. This
catches any corruption, miscalculation, or tampering. If verification fails, the
client rejects the key.

## What We Built

This week we implemented the complete key derivation system:

- **`@keypears/lib`**: Exported `privateKeyAdd`, `publicKeyAdd`, and
  `deriveDerivationPrivKey` functions
- **`@keypears/api-server`**: Created `createDerivedKey`, `getDerivedKeys`, and
  `getDerivationPrivKey` procedures
- **`@keypears/tauri-ts`**: Built a "Keys" page where users can generate derived
  keys and reveal private keys on demand

The infrastructure is in place. Next, we'll build the full Diffie-Hellman key
exchange protocol on top of it, enabling `alice@example.com` to securely share
secrets with `bob@company.com` across different domains and hosting providers.

## Conclusion

The key derivation system demonstrates a pattern we use throughout KeyPears:
servers coordinate without learning secrets. By exploiting the additive property
of elliptic curve keys, we enable server-side public key generation while
keeping private keys strictly client-side.

This isn't just a clever trick—it's the foundation for federated secret sharing.
When you share a password with a colleague at a different company, both servers
help coordinate the key exchange, but neither server can read the shared secret.
That's the promise of KeyPears: the convenience of cloud sync with the security
of self-custody.

The math is elegant. The implementation is straightforward. And the security
properties are exactly what we need for a federated Diffie-Hellman key exchange
system.

_Next up: the full DH key exchange protocol for cross-user secret sharing. Stay
tuned!_
