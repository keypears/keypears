# KeyPears

**Hybrid Post-Quantum Federated Secret Exchange**

KeyPears is an end-to-end encrypted secret sharing system built on federated
hybrid post-quantum key exchange. Your identity is a KeyPears address (e.g.
`alice@keypears.com`) backed by four key pairs: Ed25519 + ML-DSA-65 for
composite signatures and X25519 + ML-KEM-768 for hybrid encryption. An attacker
must break both classical and post-quantum algorithms to compromise any
operation.

## How it works

1. Create an account (requires proof-of-work, no email needed)
2. Set a password to save your address
3. Your address is your identity — share it with anyone

Unsaved accounts expire after 24 hours and the address is recycled.

## Development

Requires [Bun](https://bun.sh) and MySQL.

```bash
bun install
bun run dev        # starts all dev servers (keypears on port 3500)

cd webapp
bun run db:push    # push schema to MySQL
bun run test       # run tests
bun run lint       # run linter
```

## License

[MIT](./LICENSE). See [TRADEMARKS.md](./TRADEMARKS.md) for trademark policy.
