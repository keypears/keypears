A KeyPears address has the form `name@domain` — intentionally identical to an
email address. The protocol places no restrictions on the local part beyond what
email itself allows. An organization with existing email addresses can use the
same addresses for KeyPears without any changes.

## Identity model

Each user holds one or more sets of four key pairs:

- **Ed25519** — classical signing (32-byte public key)
- **X25519** — classical Diffie-Hellman (32-byte public key)
- **ML-DSA-65** (FIPS 204) — post-quantum signing (1,952-byte public key)
- **ML-KEM-768** (FIPS 203) — post-quantum key encapsulation (1,184-byte public key)

The most recent keys are the **active keys**. Signatures use composite
Ed25519 + ML-DSA-65 (both must verify). Encryption uses hybrid X25519 +
ML-KEM-768 (both shared secrets are combined via HKDF-SHA-256). Users may
rotate keys freely, up to 100 per account. Old keys are retained so that
messages encrypted under previous keys can still be decrypted.

All four private keys (Ed25519 signing key, X25519 private key, ML-DSA
signing key, and ML-KEM decapsulation key) are encrypted client-side with
AES-256-GCM under the user's encryption key and stored on the server as
ciphertext. The server cannot decrypt them.

## Domain ownership

Identity is bound to domain ownership. An address like `alice@acme.com` survives
changes in hosting provider: if `acme.com` migrates from one KeyPears server to
another, Alice's address and identity remain valid. Only the `keypears.json`
configuration file is updated.

The server currently hosting a domain is trusted to publish the current public
keys for addresses on that domain. KeyPears keeps this authority model simple
on purpose so the protocol can be embedded in many applications. If you do not
trust a hosted server to publish honest keys, host the domain yourself.

This contrasts with centralized systems where your address is controlled by the
service provider (Signal's phone numbers, Keybase's usernames). With KeyPears,
if you own your domain, you own your identity.

## Comparison with other systems

| System   | Address format | Email-compatible |
| -------- | -------------- | ---------------- |
| Email    | `name@domain`  | Yes              |
| KeyPears | `name@domain`  | Yes              |
| Signal   | Phone number   | No               |
| Matrix   | `@user:domain` | No               |
| Keybase  | `username`     | No               |

KeyPears is the only federated encrypted communication system that uses the
standard email address format. Your email address can be your KeyPears address.
