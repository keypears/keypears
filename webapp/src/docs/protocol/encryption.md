KeyPears uses AES-256-GCM (NIST SP 800-38D) for all symmetric encryption.
AES-GCM is an authenticated encryption mode (AEAD) that produces ciphertext
and an authentication tag in a single pass — no separate MAC is required. Two
encryption modes are used.

## Message encryption (ECDH)

When Alice sends a message to Bob, she computes a shared secret via
elliptic-curve Diffie-Hellman on the NIST P-256 curve:

```
S = SHA-256(ECDH(alice_private_key, bob_public_key))
```

Here `ECDH(a, B)` is the 32-byte big-endian x-coordinate of the shared
point `a·B`, as returned by the Web Crypto `crypto.subtle.deriveBits` API
— **not** the 33-byte SEC1 compressed encoding. Both parties must hash the
same raw coordinate for their derived keys to agree; mixing the two forms
produces different keys and silent decryption failures.

The message payload is encrypted with AES-256-GCM using `S` as the key. Both
Alice's and Bob's public keys are stored alongside the ciphertext, so that
either party can re-derive the shared secret after key rotation.

The recipient computes the same shared secret using their own private key and
the sender's public key:

```
S = SHA-256(ECDH(bob_private_key, alice_public_key))
```

This produces the identical shared secret due to the commutativity of ECDH.

## Vault encryption

The vault stores secrets — passwords, credentials, and notes — encrypted under
a vault key derived from the user's P-256 private key:

```
K_vault = HMAC-SHA-256(private_key, "vault-key")
```

The second argument is a fixed domain-separation string. Each vault entry is
independently encrypted with AES-256-GCM under `K_vault`.

The server stores ciphertext alongside user-provided plaintext labels (name
and search terms) to enable server-side search without revealing secret
content.

## AES-256-GCM format

AES-256-GCM produces authenticated ciphertext in the following format:

```
[Nonce (12 bytes)] || [Ciphertext] || [Auth tag (16 bytes)]
```

- The nonce is randomly generated for each encryption operation and prepended
  to the output.
- The authentication tag is produced by GCM itself and appended to the
  ciphertext.
- Decryption verifies the auth tag as part of the GCM operation. If the tag
  does not match, decryption fails with an error — no separate MAC check is
  required.

## Message structure

Each message stored on the server contains:

| Field              | Description                               |
| ------------------ | ----------------------------------------- |
| `senderAddress`    | Full address (e.g. `alice@acme.com`)      |
| `encryptedContent` | AES-256-GCM-encrypted message content     |
| `senderPubKey`     | Sender's public key at time of sending    |
| `recipientPubKey`  | Recipient's public key at time of sending |

Both public keys are stored so the recipient knows which keys to use for ECDH
decryption, even after key rotation.
