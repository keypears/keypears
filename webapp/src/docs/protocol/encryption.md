
KeyPears uses ACB3 (AES-256-CBC with BLAKE3-MAC authentication) for all
symmetric encryption. Two encryption modes are used.

## Message encryption (ECDH)

When Alice sends a message to Bob, she computes a shared secret via
elliptic-curve Diffie-Hellman on secp256k1:

```
S = BLAKE3(ECDH(alice_private_key, bob_public_key))
```

The message payload is encrypted with ACB3 using `S` as the key. Both Alice's
and Bob's public keys are stored alongside the ciphertext, so that either party
can re-derive the shared secret after key rotation.

The recipient computes the same shared secret using their own private key and the
sender's public key:

```
S = BLAKE3(ECDH(bob_private_key, alice_public_key))
```

This produces the identical shared secret due to the commutativity of ECDH.

## Vault encryption

The vault stores secrets — passwords, credentials, and notes — encrypted under a
vault key derived from the user's secp256k1 private key:

```
K_vault = BLAKE3-MAC(private_key, "vault-key")
```

The second argument is a fixed domain-separation string. Each vault entry is
independently encrypted with ACB3 under `K_vault`.

The server stores ciphertext alongside user-provided plaintext labels (name and
search terms) to enable server-side search without revealing secret content.

## ACB3 format

ACB3 produces authenticated ciphertext in the following format:

```
[BLAKE3-MAC (32 bytes)] || [IV (16 bytes)] || [AES-256-CBC ciphertext]
```

- The BLAKE3-MAC is computed over `IV || ciphertext` (encrypt-then-MAC).
- The IV is randomly generated for each encryption operation.
- Decryption verifies the MAC before attempting decryption. If the MAC does not
  match, decryption fails with an error.

## Message structure

Each message stored on the server contains:

| Field              | Description                                   |
| ------------------ | --------------------------------------------- |
| `senderAddress`    | Full address (e.g. `alice@acme.com`)          |
| `encryptedContent` | ACB3-encrypted message content                |
| `senderPubKey`     | Sender's public key at time of sending        |
| `recipientPubKey`  | Recipient's public key at time of sending     |

Both public keys are stored so the recipient knows which keys to use for ECDH
decryption, even after key rotation.
