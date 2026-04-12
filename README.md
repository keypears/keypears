# KeyPears

**Diffie-Hellman Key Exchange System**

KeyPears is an end-to-end encrypted secret sharing system built on federated
Diffie-Hellman key exchange. Your identity is a KeyPears address (e.g.
`alice@keypears.com`) tied to a P-256 (NIST) public key. Discover anyone's
public key by their address, derive a shared secret, and communicate securely.

## How it works

1. Create an account (requires proof-of-work, no email needed)
2. Set a password to save your address
3. Your address is your identity — share it with anyone

Unsaved accounts expire after 24 hours and the address is recycled.

## Development

Requires [Bun](https://bun.sh) and MySQL.

```bash
bun install
cd webapp
bun run db:push    # push schema to MySQL
bun dev            # starts on port 3001
bun run test       # run tests
bun run lint       # run linter
```

## License

All rights reserved.
