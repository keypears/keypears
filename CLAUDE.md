# KeyPears

An end-to-end encrypted secret sharing system built on federated Diffie-Hellman
key exchange. User identities are KeyPears addresses (e.g. `alice@keypears.com`).

## Project structure

```
keypears/
  package.json          # bun workspace root (orchestrates all projects)
  issues/               # issue tracking (see "Issues and experiments")
  kp1/                  # archived kp1 codebase (reference only)
  packages/
    pow5-rs/            # PoW algorithm (Rust, compiles to WASM)
    pow5-ts/            # PoW TypeScript wrapper (@keypears/pow5)
  passapples/           # Astro landing page for passapples.test
  lockberries/          # Astro landing page for lockberries.test
  vendor/               # third-party repos for research (gitignored)
  webapp/               # TanStack Start app (@keypears/webapp)
    src/
      routes/           # TanStack Router file-based routes
        __root.tsx      # root layout
        index.tsx       # landing page (create account + PoW)
        login.tsx       # login page (with PoW)
        _app.tsx        # authenticated layout (requires login)
        _app/
          welcome.tsx   # onboarding (set address + password)
          _saved.tsx    # layout requiring saved password
          _saved/
            _chrome.tsx # layout with sidebar + footer
            _chrome/
              home.tsx      # home page (greeting)
              inbox.tsx     # inbox (placeholder)
              send.tsx      # send message (with PoW)
              vault.tsx     # vault entry list (search, create, pagination)
              keys.tsx      # key management (rotate, per-key passwords)
              password.tsx  # change password
              domains.tsx   # domain claiming + admin user management
              settings.tsx  # PoW difficulty settings
              $profile.tsx  # profile page
            channel.$address.tsx  # conversation view
            vault.$id.tsx         # vault entry detail (split layout)
      components/
        Sidebar.tsx     # responsive sidebar + user dropdown
        Footer.tsx      # astrohacker footer
        PowModal.tsx    # reusable PoW mining modal
        PowBadge.tsx    # difficulty display (chip icon + formatted number)
        ui/             # shadcn components
      server/
        api.router.ts      # oRPC router (federation API at /api)
        user.functions.ts  # createServerFn wrappers (safe to import from client)
        user.server.ts     # DB logic (server-only)
        message.functions.ts # messaging server functions
        message.server.ts  # messaging DB logic
        vault.functions.ts # vault CRUD server functions
        vault.server.ts    # vault DB logic
        auth-middleware.ts # TanStack Start auth middleware (createMiddleware)
        federation.server.ts # cross-domain delivery (pull model)
        pow.functions.ts   # PoW challenge server functions
        pow.server.ts      # PoW challenge creation + verification
        pow.consume.ts     # PoW replay prevention (DB-dependent)
        config.functions.ts # domain config server functions
        wellknown.functions.ts # keypears.json server function
        schemas.ts         # shared Zod schemas
      db/
        schema.ts       # Drizzle schema
        schema.clear.ts # empty schema for db:clear
        index.ts        # MySQL connection pool
      lib/
        auth.ts         # three-tier PBKDF2-SHA256 KDF + encryption key caching
        config.ts       # domain config + derived secrets
        message.ts      # ECDH encryption/decryption
        vault.ts        # vault key derivation + entry encrypt/decrypt
        channel-context.tsx # React context for channel polling
        use-pow-miner.ts   # shared PoW mining hook
        icons.ts        # auto-generated type-safe image paths
        utils.ts        # shadcn utility (cn)
    docs/
      kdf.md            # key derivation documentation
```

## Tech stack

- **Framework**: TanStack Start, TanStack Router, React 19
- **Database**: Drizzle ORM, MySQL
- **API**: oRPC (type-safe RPC with Zod validation) at `/api`
- **Styling**: Tailwind CSS v4, shadcn components
- **Auth**: Three-tier PBKDF2-HMAC-SHA256 KDF (password key -> encryption key + login key)
- **Sessions**: Random 32-byte tokens, SHA-256-hashed in DB, 30-day expiry
- **Crypto**: P-256 key pairs, AES-256-GCM encryption, ECDH shared secrets (`@webbuf/*`)
- **PoW**: pow5-64b algorithm (WebGPU), signed stateless challenges
- **Federation**: Pull-model message delivery, domain verification via TLS
- **Env**: dotenvx for encrypted env management
- **Linting**: oxlint (161 rules)
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
bun run dev               # starts all servers (keypears, passapples, lockberries)
```

Or run individual servers from `webapp/`:

```bash
cd webapp
bun run dev:keypears      # keypears.test on port 3500
bun run dev:passapples    # keypears.passapples.test on port 3512
bun run db:clear          # drop all tables (both databases)
bun run db:push           # push schema to MySQL (both databases)
bun run test              # run tests
bun run lint              # run linter
bun run format            # format code
bun run build:icons       # regenerate images from raw-icons/
```

### Environment variables

Two domain env vars are required:

- `KEYPEARS_DOMAIN` — the address domain (goes after `@` in user addresses)
- `KEYPEARS_API_DOMAIN` — where this server's API runs (may differ for subdomain deployments)
- `DATABASE_URL` — MySQL connection string
- `KEYPEARS_SECRET` — master secret for deriving PoW signing keys (64-char hex)

### Dev topology

Three deployment patterns are tested locally:

```
keypears.test              → webapp/ port 3500 (primary self-hosted)
keypears.passapples.test   → webapp/ port 3512 (subdomain self-hosted)
passapples.test            → passapples/ port 3510 (Astro landing page)
lockberries.test           → lockberries/ port 3520 (Astro landing, third-party hosted)
```

## Key conventions

- Server functions follow the two-file pattern:
  - `*.functions.ts` — `createServerFn` wrappers, safe to import from client
  - `*.server.ts` — DB/crypto logic, only imported inside handler bodies
- Use `$icon()` from `~/lib/icons` for type-safe image paths.
- Use shadcn components for UI where appropriate.
- Always capitalize "KeyPears" with capital K and P in user-facing text.
- All address input fields require the full `name@domain` format.

### TanStack Router / Start best practices

These are mandatory. Violations break SPA behavior, type safety, or security.

**Navigation:**
- ALWAYS use `<Link>` or `useNavigate` for internal links. NEVER use raw
  `<a href="...">` or `window.location.href` without explicit approval.
- The only approved `window.location.href` is logout (intentional full reload
  to clear all client state).
- Use typed route paths with `params` for dynamic segments:
  `<Link to="/channel/$address" params={{ address }}>` — NEVER string
  interpolation like `` to={`/channel/${address}`} ``.
- Search params: use `search={{ key: value }}` on `<Link>`, never manual
  query strings.
- `pathParamsAllowedCharacters: ["@"]` is set on the router. This prevents
  TanStack Router from encoding `@` as `%40` in URLs. If other characters
  need preserving, add them to the array in `router.tsx`.

**Route data:**
- Use `validateSearch` with Zod and `.catch()` for search params — never
  manual type checking.
- Route loaders are **isomorphic** (run on both server and client). NEVER
  access secrets, env vars, or database directly in a loader. Always delegate
  to `createServerFn`.
- After mutations, use `router.invalidate()` to refresh route data when the
  page reads loader data directly. For pages with client-managed state (search,
  pagination), manual refetch is acceptable.
- Don't copy loader data into `useState` unless you need to modify it
  client-side (search, pagination). Read `Route.useLoaderData()` directly
  when the data is just rendered.
- When you DO copy loader data into `useState`, you MUST add a `useEffect`
  to sync it when the loader re-runs, or state goes stale on back navigation:
  ```typescript
  const { items: initialItems } = Route.useLoaderData();
  const [items, setItems] = useState(initialItems);
  useEffect(() => { setItems(initialItems); }, [initialItems]);
  ```
- NEVER use `getCachedEncryptionKey()` or similar functions that return new
  object references as useEffect dependencies — this causes infinite render
  loops. Read them inside the effect body instead.

**Server functions:**
- Protected server functions use `.middleware([authMiddleware])` and read
  `context.userId` — don't call `requireSessionUserId()` directly.
- Functions with optional auth (works with or without login) use
  `getSessionUserId()` directly — these don't use middleware.
- Use `.inputValidator()` with Zod for all server function inputs.

**Error handling:**
- `defaultErrorComponent`, `defaultPendingComponent`, and
  `defaultNotFoundComponent` are set at the router level in `router.tsx`.
- Individual routes can override with their own components.
- `pendingComponent` only fires during `loader`, NOT during `beforeLoad`.

**Preloading and caching:**
- `defaultPreload: 'intent'` is set — hovering over `<Link>` preloads the
  target route data automatically.
- `autoCodeSplitting` is forced on by TanStack Start — no config needed.

## Auth architecture

### Three-tier key derivation (see docs/kdf.md)

```
Password (never stored)
  -> Password Key (ephemeral, discarded after use)
    -> Encryption Key (cached in localStorage, encrypts private keys)
    -> Login Key (sent to server once, then discarded)
```

- All KDF uses PBKDF2-HMAC-SHA256 (RFC 8018), 100k rounds per tier.
- Only the encryption key is cached. Password key is ephemeral.
- If localStorage is compromised: attacker can decrypt keys but cannot
  impersonate the user (login key is a sibling, not derivable from encryption key).
- Server hashes the login key with 100k additional rounds before storing.

### Sessions

- Random 32-byte session token set as httpOnly cookie.
- Server stores only the SHA-256 hash of the token.
- 30-day expiry for saved accounts, 1-day for unsaved.
- Password change revokes all other sessions.

### Proof of work

- Account creation requires PoW (difficulty 70M, ~15s on WebGPU).
- Login requires PoW (difficulty 7M, ~1-2s).
- Every message requires PoW. Difficulty is configurable per user:
  - `channelDifficulty` — first message to a user (default 70M).
  - `messageDifficulty` — subsequent messages (default 7M).
  - Server-enforced minimums: 7M for both.
  - Users configure via sliders on the Settings page.
- Challenge requests are authenticated: sender signs with P-256 ECDSA,
  recipient verifies via federation public key lookup. This prevents
  probing channel existence (social graph privacy).
- Both sender and recipient addresses are signed into the challenge
  payload, preventing reuse across conversations.
- Challenges are signed with HMAC-SHA256 — stateless until verified.
- PoW solutions are tracked in `used_pow` table for replay prevention.
- All PoW is logged against the user who did the work (`pow_log` table).
- All PoW mining happens in the browser via WebGPU. Servers never mine.

### Key management

- Users can rotate P-256 key pairs (max 100 per account).
- Active key = most recent row in `user_keys` table.
- Each key tracks `loginKeyHash` — identifies which password encrypted it.
- Keys encrypted with the current login password auto-decrypt.
- Keys encrypted with a different password show as "locked" — user can
  re-encrypt by entering the old password on the Keys page.

### Password change

- Only re-encrypts keys that match the current password.
- Keys under a different password are left untouched.
- Server atomically updates password hash + re-encrypted keys.

### Domain claiming

- Users can claim custom domains via `keypears.json` with `admin` field.
- Admin verified against `keypears.json` on every privileged action.
- Admin can create users and reset passwords for their domain.

## Database schema

- **domains**: id, domain, adminUserId, openRegistration, allowThirdPartyDomains, createdAt
- **users**: id, domainId, name, passwordHash, channelDifficulty, messageDifficulty, expiresAt, createdAt
- **user_keys**: id, userId, keyNumber, publicKey, encryptedPrivateKey, loginKeyHash, createdAt
- **sessions**: tokenHash (PK), userId, expiresAt, createdAt
- **vault_entries**: id, userId, name, type, searchTerms, publicKey, encryptedData, createdAt, updatedAt
- **channels**: id, ownerId, counterpartyAddress, createdAt, updatedAt
- **messages**: id, channelId, senderAddress, encryptedContent, senderPubKey, recipientPubKey, isRead, createdAt
- **pending_deliveries**: id, tokenHash, senderAddress, recipientAddress, encryptedContent, senderPubKey, recipientPubKey, createdAt
- **used_pow**: solvedHeaderHash (PK), solvedHeader, target, expiresAt, createdAt
- **pow_log**: id, userId, algorithm, difficulty, cumulativeDifficulty, createdAt

## Route protection

Two-layer auth gate:
1. `_app.tsx` — requires logged in (any user), redirects to `/` if not
2. `_app/_saved.tsx` — requires password set, redirects to `/welcome` if not

## Issues and experiments

Every significant piece of work gets an issue in `issues/`. Issues
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
6. Close the issue — write a Conclusion section, update frontmatter.

Every closed issue MUST have a `## Conclusion` section summarizing what was
accomplished, what changed, and key decisions made. The conclusion is the
permanent record of the work — someone reading only the conclusion should
understand the outcome without reading every experiment.

Closed issues are immutable and must NEVER be modified.
