KeyPears uses AES-256-GCM (NIST SP 800-38D) for all symmetric encryption.
AES-GCM is an authenticated encryption mode (AEAD) that produces ciphertext
and an authentication tag in a single pass — no separate MAC is required. Two
encryption modes are used.

## Message encryption (hybrid X25519 + ML-KEM-768)

When Alice sends a message to Bob, she performs both a classical X25519
Diffie-Hellman exchange and a post-quantum ML-KEM-768 encapsulation:

```
x25519_shared_secret = X25519(alice_x25519_private, bob_x25519_public)
(mlkem_ciphertext_bob, mlkem_shared_secret) = ML-KEM-768.Encaps(bob_encap_public_key)
```

The AES-256-GCM encryption key is derived by concatenating both shared secrets
and running them through HKDF-SHA-256 with a context binding the sender and
recipient addresses:

```
combined = x25519_shared_secret || mlkem_shared_secret
message_key = HKDF-SHA-256(combined, context)
```

An attacker must break **both** X25519 and ML-KEM-768 to recover the message
key. This hybrid construction ensures that a breakthrough against lattice-based
cryptography alone does not compromise confidentiality, and a breakthrough
against elliptic curves alone does not either.

Alice also encrypts a second copy of the message to her own keys, so she
can decrypt her sent-message history:

```
x25519_shared_secret_alice = X25519(alice_x25519_private, alice_x25519_public)
(mlkem_ciphertext_alice, mlkem_shared_secret_alice) = ML-KEM-768.Encaps(alice_encap_public_key)
```

After encryption, Alice signs a canonical length-prefixed envelope containing
both ciphertexts and metadata with a **composite Ed25519 + ML-DSA-65
signature** (3,374 bytes). Both signing algorithms sign the same envelope
independently, and the two signatures are concatenated. The signature covers
the sender address, recipient address, and all ciphertext — preventing
tampering and proving sender identity. Verification requires both signatures
to be valid.

Additional Authenticated Data (AAD) binds the sender and recipient addresses
into the AES-GCM authentication tag. This ensures ciphertext cannot be
re-targeted to a different conversation without detection.

The recipient performs the inverse hybrid decryption:

```
x25519_shared_secret = X25519(bob_x25519_private, alice_x25519_public)
mlkem_shared_secret = ML-KEM-768.Decaps(bob_decap_key, mlkem_ciphertext_bob)
combined = x25519_shared_secret || mlkem_shared_secret
message_key = HKDF-SHA-256(combined, context)
```

The recipient derives the same AES key and decrypts the message.

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

| Field                    | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `senderAddress`          | Full address (e.g. `alice@acme.com`)                     |
| `encryptedContent`       | Hybrid-encrypted message (recipient's copy)              |
| `senderEncryptedContent` | Hybrid-encrypted message (sender's copy for sent history)|
| `senderEd25519PubKey`    | Sender's Ed25519 public key (for composite sig verify)   |
| `senderX25519PubKey`     | Sender's X25519 public key (for hybrid DH)               |
| `senderMldsaPubKey`      | Sender's ML-DSA-65 verifying key (for composite sig)     |
| `recipientX25519PubKey`  | Recipient's X25519 public key (for hybrid DH)            |
| `recipientMlkemPubKey`   | Recipient's ML-KEM-768 encapsulation key                 |
| `senderSignature`        | Composite Ed25519 + ML-DSA-65 signature (3,374 bytes)    |

All public keys are stored so the recipient can verify the composite signature
and perform hybrid decryption (X25519 DH + ML-KEM decapsulation), even after
key rotation.
