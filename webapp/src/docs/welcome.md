
KeyPears is a federated protocol for end-to-end encrypted communication and
secret management. User identities are email-style addresses (`name@domain`)
backed by secp256k1 key pairs. Any domain can host a KeyPears server, and
servers discover each other through DNS.

## What KeyPears does

- **Encrypted messaging** between users on any domain, with automatic key
  exchange via ECDH.
- **Secret vault** for storing passwords, credentials, and notes, encrypted
  client-side.
- **Federated identity** — your address is `name@domain`, the same format as
  email. If you own your domain, you own your identity.
- **Proof of work** for Sybil resistance — no CAPTCHAs, no phone numbers, no
  third-party verification.

## Who it's for

- **Individuals** who want encrypted communication without surrendering identity
  to a centralized service.
- **Organizations** that need to control their own communication infrastructure
  while remaining interoperable with the wider network.
- **Developers** building on an open, federated protocol with a simple API.

## How it works

All cryptographic operations — key derivation, Diffie-Hellman key exchange,
encryption, and proof of work — execute client-side. Servers store only
ciphertext and never possess the keys needed to decrypt it.

For a concise protocol overview, read the
[whitepaper](https://keypears.com/keypears.pdf) (8 pages).

For detailed documentation, explore the sections in the sidebar:

- [Protocol](/protocol/addressing/) — addressing, key derivation, encryption,
  proof of work
- [Federation](/federation/) — how domains discover each other and exchange
  messages
- [Self-Hosting](/self-hosting/) — run your own KeyPears server
- [Security](/security/) — threat model and limitations
