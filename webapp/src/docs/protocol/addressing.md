A KeyPears address has the form `name@domain` — intentionally identical to an
email address. The protocol places no restrictions on the local part beyond what
email itself allows. An organization with existing email addresses can use the
same addresses for KeyPears without any changes.

## Identity model

Each user holds one or more pairs of post-quantum keys: an **ML-DSA-65**
(FIPS 204) signing key pair and an **ML-KEM-768** (FIPS 203) encryption key
pair. The most recent keys are the **active keys** — the ML-KEM-768
encapsulation key is used for key encapsulation in new messages, and the
ML-DSA-65 verification key is used to authenticate the sender. Users may
rotate keys freely, up to 100 per account. Old keys are retained so that
messages encrypted under previous keys can still be decrypted.

Signing keys and decapsulation keys are encrypted client-side with AES-256-GCM
under the user's encryption key and stored on the server as ciphertext. The
server cannot decrypt them.

## Domain ownership

Identity is bound to domain ownership. An address like `alice@acme.com` survives
changes in hosting provider: if `acme.com` migrates from one KeyPears server to
another, Alice's address and identity remain valid. Only the `keypears.json`
configuration file is updated.

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
