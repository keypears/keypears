# KeyPears

**Simple Federated Encrypted Messaging System**

KeyPears is an encrypted messaging system with email-style federated addressing.
Your identity is a KeyPears address (e.g. `alice@keypears.com`) backed by four
key pairs: Ed25519 + ML-DSA-65 for composite signatures and X25519 +
ML-KEM-768 for hybrid encryption.

The protocol is intentionally simple so many kinds of apps can embed it.
Servers are trusted to publish honest current public keys for their hosted
addresses; if you do not trust a hosted server, host your own domain. Compared
with email, server compromise has a smaller cryptographic blast radius: stored
message bodies remain ciphertext unless the attacker also obtains client-side
keys, passwords, or active client access.

## How it works

1. Create an account (requires proof-of-work, no email needed)
2. Set a password to save your address
3. Your address is your identity — share it with anyone

Unsaved accounts expire after 24 hours and the address is recycled.

## Development

Requires [Node.js](https://nodejs.org/), [pnpm](https://pnpm.io/), and MySQL.

```bash
pnpm install
pnpm run dev       # starts all dev servers (keypears on port 3500)

cd webapp
pnpm run db:push   # push schema to MySQL
pnpm run test      # run tests
pnpm run lint      # run linter
```

## License

[MIT](./LICENSE). See [TRADEMARKS.md](./TRADEMARKS.md) for trademark policy.
