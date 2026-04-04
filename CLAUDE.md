# KeyPears

An end-to-end encrypted secret sharing system built on federated Diffie-Hellman
key exchange. User identities are KeyPears addresses (e.g. `1@keypears.com`).

## Project structure

```
keypears/
  package.json          # bun workspace root
  kp1/                  # archived kp1 codebase (reference only)
  packages/
    pow5-rs/            # PoW algorithm (Rust, compiles to WASM)
    pow5-ts/            # PoW TypeScript wrapper (@keypears/pow5)
  webapp/               # TanStack Start app (@keypears/webapp)
    src/
      routes/           # TanStack Router file-based routes
        __root.tsx      # root layout
        index.tsx       # landing page (create account + PoW)
        login.tsx       # login page (with PoW)
        _app.tsx        # authenticated layout (requires login)
        _app/
          welcome.tsx   # onboarding (set password)
          $profile.tsx  # profile page (/@N)
          _saved.tsx    # layout requiring saved password
          _saved/
            inbox.tsx   # inbox (placeholder)
            send.tsx    # send (placeholder)
            vault.tsx   # vault (placeholder)
            keys.tsx    # key rotation
            password.tsx # change password
      components/
        Sidebar.tsx     # responsive sidebar + user dropdown
        Footer.tsx      # astrohacker footer
        ui/             # shadcn components
      server/
        user.functions.ts  # createServerFn wrappers (safe to import from client)
        user.server.ts     # DB logic (server-only)
        pow.functions.ts   # PoW challenge server functions
        pow.server.ts      # PoW challenge creation + verification
      db/
        schema.ts       # Drizzle schema (users, user_keys, pow_log)
        schema.clear.ts # empty schema for db:clear
        index.ts        # MySQL connection pool
      lib/
        auth.ts         # three-tier KDF + encryption key caching
        icons.ts        # auto-generated type-safe image paths
        utils.ts        # shadcn utility (cn)
    docs/
      kdf.md            # key derivation documentation
```

## Tech stack

- **Framework**: TanStack Start, TanStack Router, React 19
- **Database**: Drizzle ORM, MySQL
- **Styling**: Tailwind CSS v4, shadcn components
- **Auth**: Three-tier SHA-256 PBKDF (password key -> encryption key + login key)
- **Crypto**: secp256k1 key pairs, ACS2 encryption (`@webbuf/*` libraries)
- **PoW**: pow5-64b algorithm (WASM), signed stateless challenges (no DB)
- **Env**: dotenvx for encrypted env management
- **Linting**: oxlint
- **Formatting**: Prettier
- **Testing**: Vitest
- **Package manager**: Bun
- **Runtime**: Bun

## Documentation

- [docs/dev-setup.md](docs/dev-setup.md) — Local HTTPS via Caddy + dnsmasq
- [docs/federation.md](docs/federation.md) — Federation model and cross-domain messaging
- [docs/kdf.md](docs/kdf.md) — Key derivation system

## Development

Local HTTPS via Caddy reverse proxy — see [docs/dev-setup.md](docs/dev-setup.md).

```bash
bun install               # from repo root
cd webapp
bun dev                   # starts on port 3001, access via https://keypears.test
bun run db:clear          # drop all tables
bun run db:push           # push schema to MySQL
bun run test              # run tests
bun run lint              # run linter
bun run format            # format code
bun run build:icons       # regenerate images from raw-icons/
```

## Key conventions

- Use a single `DATABASE_URL` env var for database connections.
- Use `dotenvx run -f .env.dev --` to wrap commands that need env vars.
- Server functions follow the two-file pattern:
  - `*.functions.ts` — `createServerFn` wrappers, safe to import from client
  - `*.server.ts` — DB/crypto logic, only imported inside handler bodies
- Use `$icon()` from `~/lib/icons` for type-safe image paths.
- Use shadcn components for UI where appropriate.
- Always capitalize "KeyPears" with capital K and P in user-facing text.

## Auth architecture

### Three-tier key derivation (see docs/kdf.md)

```
Password (never stored)
  -> Password Key (ephemeral, discarded after use)
    -> Encryption Key (cached in localStorage, encrypts private keys)
    -> Login Key (sent to server once, then discarded)
```

- Only the encryption key is cached. Password key is ephemeral.
- If localStorage is compromised: attacker can decrypt keys but cannot
  impersonate the user (login key is a sibling, not derivable from encryption key).
- Server hashes the login key with 100k additional rounds before storing.

### Proof of work

- Account creation requires PoW (difficulty 700k, ~15s on fast hardware).
- Login requires lighter PoW (difficulty 70k, ~1-2s).
- Challenges are signed with HMAC — no database writes until PoW is verified.
- PoW history is logged per user with cumulative difficulty on profile.

### Key rotation

- Users can rotate secp256k1 key pairs (max 100 per account).
- Active key = most recent row in `user_keys` table.
- Key numbers are assigned atomically via database transaction.

### Password change

- All encrypted private keys are re-encrypted client-side with new encryption key.
- Server atomically updates password hash + all encrypted keys in one transaction.

## Database schema

- **users**: id, passwordHash, expiresAt, createdAt
- **user_keys**: id, userId, keyNumber, publicKey, encryptedPrivateKey, createdAt
- **pow_log**: id, userId, algorithm, difficulty, cumulativeDifficulty, createdAt

## Route protection

Two-layer auth gate:
1. `_app.tsx` — requires logged in (any user), redirects to `/` if not
2. `_app/_saved.tsx` — requires password set, redirects to `/welcome` if not

## Issues and experiments

Every significant piece of work gets an issue in `webapp/issues/`. Issues
describe the problem, provide background, and propose solutions. Experiments
are the incremental steps that solve the problem.

### Issue structure

Each issue is a **folder** containing a `README.md` with TOML frontmatter:

```
issues/0001-some-topic/
├── README.md          <- main issue document with frontmatter
├── 01-sub-topic.md    <- optional: additional files for long issues
└── 02-sub-topic.md
```

The folder name is `{number}-{slug}`. The number is 4-digit, globally sequential.

#### Frontmatter

```
+++
status = "open"
opened = "2026-04-02"
+++
```

### Experiments

Only after the issue's requirements are clear. Each experiment is designed,
implemented, and concluded before the next one is designed.

**Never list experiments upfront.** The outcome of each experiment informs what
comes next.

### Process summary

1. Create the issue with frontmatter, goal, background. No experiments yet.
2. Design Experiment 1.
3. Implement Experiment 1.
4. Record the result — Pass, partial, or fail with a conclusion.
5. Repeat until the goal is met.
6. Close the issue — write Conclusion, update frontmatter.

Closed issues are immutable and must NEVER be modified.
