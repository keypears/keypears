KeyPears uses AES-256-GCM (NIST SP 800-38D) for all symmetric encryption.
AES-GCM is an authenticated encryption mode (AEAD) that produces ciphertext
and an authentication tag in a single pass — no separate MAC is required. Two
encryption modes are used.

## Message encryption (ML-KEM-768)

When Alice sends a message to Bob, she encapsulates a shared secret to Bob's
ML-KEM-768 encapsulation key:

```
(ciphertext_bob, shared_secret) = ML-KEM-768.Encaps(bob_encap_public_key)
```

The AES-256-GCM encryption key is derived from the shared secret via
HKDF-SHA-256 with a context binding the sender and recipient addresses.

Alice also encrypts a second copy of the message to her own ML-KEM key, so she
can decrypt her sent-message history:

```
(ciphertext_alice, shared_secret_alice) = ML-KEM-768.Encaps(alice_encap_public_key)
```

After encryption, Alice signs a canonical length-prefixed envelope containing
both ciphertexts and metadata with her ML-DSA-65 signing key. The signature
covers the sender address, recipient address, and all ciphertext — preventing
tampering and proving sender identity.

Additional Authenticated Data (AAD) binds the sender and recipient addresses
into the AES-GCM authentication tag. This ensures ciphertext cannot be
re-targeted to a different conversation without detection.

The recipient decapsulates the shared secret using their ML-KEM decapsulation
key:

```
shared_secret = ML-KEM-768.Decaps(bob_decap_key, ciphertext_bob)
```

The recipient derives the same AES key via HKDF-SHA-256 with the same context
and decrypts the message.

## Vault encryption

The vault stores secrets — passwords, credentials, and notes — encrypted under
a vault key derived from the user's encryption key:

```
K_vault = HMAC-SHA-256(encryption_key, "vault-key-v2")
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

Both public keys are stored so the recipient knows which keys to use for
ML-KEM decapsulation, even after key rotation.
