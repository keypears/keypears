# KeyPears

A simple federated encrypted messaging and secret sharing system built on
hybrid Curve25519 + post-quantum key exchange. User identities are KeyPears
addresses (e.g. `alice@keypears.com`).

KeyPears prioritizes protocol simplicity so many kinds of apps can embed it.
Servers are trusted authorities for the current public keys of their hosted
addresses; the trust exit is self-hosting your own domain, not adding global
key transparency or a no-trust hosted-server layer. Do not describe KeyPears as
protecting future messages from an active server that lies about public keys.
It protects stored ciphertext from database/passive server compromise unless
the attacker also obtains client-side keys, passwords, or active client access.

## Project structure

```
keypears/
  package.json          # bun workspace root (orchestrates all projects)
  issues/               # issue tracking (see "Issues and experiments")
  epics/                # multi-issue planning records
  kp1/                  # archived kp1 codebase (reference only)
  packages/
    client/             # @keypears/client — typed oRPC client + auth helpers
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
            sign.tsx              # third-party auth signing page
      components/
        Sidebar.tsx     # responsive sidebar + user dropdown
        Footer.tsx      # astrohacker footer
        PowModal.tsx    # reusable PoW mining modal
        PowBadge.tsx    # difficulty display (chip icon + formatted number)
        ui/             # shadcn components
      server/
        api.router.ts      # oRPC router implementing @keypears/client contract (at /api)
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
        message.ts      # hybrid X25519 + ML-KEM encryption/decryption
        vault.ts        # vault key derivation + entry encrypt/decrypt
        channel-context.tsx # React context for channel polling
        use-pow-miner.ts   # shared PoW mining hook
        icons.ts        # auto-generated type-safe image paths
        utils.ts        # shadcn utility (cn)
      docs/
        welcome.md              # overview
        development.md          # local HTTPS via Caddy + dnsmasq
        self-hosting.md         # running your own server
        domain-claiming.md      # claiming a domain on a third-party server
        security.md              # threat model and defenses
        federation.md            # federation model
        protocol/
          addressing.md          # address format and identity
          key-derivation.md      # three-tier PBKDF2-HMAC-SHA-256
          encryption.md          # AES-256-GCM, hybrid X25519 + ML-KEM-768
          proof-of-work.md       # pow5-64b challenges
```

## Tech stack

- **Framework**: TanStack Start, TanStack Router, React 19
- **Database**: Drizzle ORM, MySQL
- **API**: oRPC (type-safe RPC with Zod validation) at `/api`, contract defined in `@keypears/client`
- **Styling**: Tailwind CSS v4, shadcn components
- **Auth**: Three-tier PBKDF2-HMAC-SHA256 KDF (password key -> encryption key + login key)
- **Sessions**: Random 32-byte tokens, SHA-256-hashed in DB, 30-day expiry
- **Crypto**: Four key pairs per user — Ed25519 + ML-DSA-65 for composite signatures, X25519 + ML-KEM-768 for hybrid encryption, AES-256-GCM (`@webbuf/sig-ed25519-mldsa`, `@webbuf/aesgcm-x25519dh-mlkem`, `@webbuf/ed25519`, `@webbuf/x25519`, `@webbuf/mldsa`, `@webbuf/mlkem`)
- **PoW**: pow5-64b algorithm (WebGPU), signed stateless challenges
- **Federation**: Pull-model message delivery, domain verification via TLS
- **Third-party auth**: OAuth-style redirect flow with composite Ed25519 + ML-DSA-65 signing, POST callback because composite signatures are 3,374 bytes (`/sign` page + `@keypears/client` auth helpers)
- **Env**: dotenvx for encrypted env management
- **Linting**: oxlint (161 rules)
- **Formatting**: Prettier
- **Testing**: Vitest
- **Package manager**: Bun
- **Runtime**: Bun

## Documentation

All documentation lives under `webapp/src/docs/` and is served at `/docs/*`:

- [webapp/src/docs/development.md](webapp/src/docs/development.md) — Local HTTPS via Caddy + dnsmasq
- [webapp/src/docs/federation.md](webapp/src/docs/federation.md) — Federation model and cross-domain messaging
- [webapp/src/docs/self-hosting.md](webapp/src/docs/self-hosting.md) — Run your own server, env vars, claiming your primary domain
- [webapp/src/docs/domain-claiming.md](webapp/src/docs/domain-claiming.md) — Claiming a domain on a third-party server, bootstrap flow
- [webapp/src/docs/protocol/key-derivation.md](webapp/src/docs/protocol/key-derivation.md) — Three-tier PBKDF2-HMAC-SHA-256
- [webapp/src/docs/protocol/encryption.md](webapp/src/docs/protocol/encryption.md) — AES-256-GCM, hybrid X25519 + ML-KEM-768
- [webapp/src/docs/security.md](webapp/src/docs/security.md) — Threat model and browser defenses

**Env var invariant:** whenever you add, remove, or change an environment
variable read from `webapp/src/lib/config.ts`, update the env vars table in
`webapp/src/docs/self-hosting.md` in the same commit. That table is the
single source of truth for what a self-hoster has to configure, and it
rots invisibly if not maintained alongside code changes.

## Development

Local HTTPS via Caddy reverse proxy — see [webapp/src/docs/development.md](webapp/src/docs/development.md).

```bash
bun install               # from repo root
bun run dev               # starts all servers (keypears, passapples, lockberries)
```

Or run individual servers from `webapp/`:

```bash
cd webapp
bun run dev:keypears      # keypears.test on port 3500
bun run dev:passapples    # keypears.passapples.test on port 3512
bun run build             # blog + vite build
bun run start             # run built server (dist/server/server.js)
bun run typecheck         # tsc --noEmit
bun run db:clear          # drop all tables (both databases)
bun run db:push           # push schema to MySQL (both databases)
bun run db:push:prod      # push schema to prod database
bun run test              # run tests
bun run lint              # run linter
bun run format            # format code
bun run build:icons       # regenerate images from raw-icons/
bun run deploy            # build, push, and roll ECS (from repo root)
```

TanStack Router's route tree (`routeTree.gen.ts`) is generated automatically
by the vite plugin at dev/build time. There is no standalone generate command —
start the dev server or run a build.

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
- **Auth rule:** TanStack Start server functions are exposed as HTTP endpoints
  — route guards (like `_app/_saved`) do NOT protect them. Any server
  function that should only be callable by authenticated users MUST use
  `.middleware([authMiddleware])`. A function living in a protected route file
  is not automatically protected.

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

### Three-tier key derivation (see webapp/src/docs/protocol/key-derivation.md)

```
Password (never stored)
  -> Password Key (ephemeral, discarded after use)
    -> Encryption Key (cached in localStorage, encrypts all four private keys: Ed25519, X25519, ML-DSA-65, ML-KEM-768)
    -> Login Key (sent to server once, then discarded)
```

- All KDF uses PBKDF2-HMAC-SHA-256 (RFC 8018): two deterministic 300k-round
  client tiers, plus a 600k-round server tier with a per-user salt.
- Only the encryption key is cached. Password key is ephemeral.
- If localStorage alone is compromised: attacker gets the cached encryption key, but
  cannot derive the login key or create a server session from it. If they also obtain
  encrypted private-key blobs, they can decrypt them. Active origin/session compromise
  is stronger and can sign messages or auth assertions as the user.
- Server hashes the login key with 600k additional rounds using a per-user salt
  (derived from userId) before storing. Treat the 600k per-user server tier as
  the conservative password-storage baseline; the deterministic client tiers add
  stretching but can be reused per password candidate across users.

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
- Challenge requests are authenticated: sender signs with composite
  Ed25519 + ML-DSA-65, recipient verifies via the sender's authoritative
  federation public key lookup. This prevents probing channel existence
  (social graph privacy) while preserving the protocol's simple server-trust
  model.
- Both sender and recipient addresses are signed into the challenge
  payload, preventing reuse across conversations.
- Challenges are signed with HMAC-SHA256 — stateless until verified.
- PoW solutions are tracked in `used_pow` table for replay prevention.
- All PoW is logged against the user who did the work (`pow_log` table).
- All PoW mining happens in the browser via WebGPU. Servers never mine.

### Key management

- Users can rotate key pairs (max 100 per account). Each key row contains four key pairs rotated atomically: Ed25519, X25519, ML-DSA-65, ML-KEM-768.
- Active key = most recent row in `user_keys` table (all four key pairs).
- Each key tracks `loginKeyHash` — identifies which password encrypted it.
- All four private keys encrypted with the current login password auto-decrypt.
- Keys encrypted with a different password show as "locked" — user can
  re-encrypt by entering the old password on the Keys page.

### Password change

- Only re-encrypts all four private keys for key rows that match the current password.
- Keys under a different password are left untouched.
- Server atomically updates password hash + re-encrypted private keys (Ed25519, X25519, ML-DSA-65, ML-KEM-768).

### Domain claiming

- Users can claim custom domains via `keypears.json` with `admin` field.
- Admin verified against `keypears.json` on every privileged action.
- Admin can create users and reset passwords for their domain.

## Database rules

Never use `mysqlEnum` from Drizzle. MySQL ENUMs are painful to
migrate — adding or removing a value requires an ALTER TABLE that
rewrites the entire table on large datasets.

Instead, use a plain `varchar` with Drizzle's `.$type<>()` for
type-safe string unions:

```ts
kind: varchar("kind", { length: 16 }).$type<"domain" | "feed">().notNull(),
```

This stores as a regular `VARCHAR` in MySQL (no migration pain) but
TypeScript enforces the allowed values at compile time.

## Database schema

- **domains**: id, domain, adminUserId, openRegistration, allowThirdPartyDomains, createdAt
- **users**: id, domainId, name, passwordHash, channelDifficulty, messageDifficulty, expiresAt, createdAt
- **user_keys**: id, userId, keyNumber, ed25519PublicKey, encryptedEd25519Key, x25519PublicKey, encryptedX25519Key, signingPublicKey, encryptedSigningKey, encapPublicKey, encryptedDecapKey, loginKeyHash, createdAt
- **sessions**: tokenHash (PK), userId, expiresAt, createdAt
- **vault_entries**: id, userId, name, type, searchTerms, keyId, encryptedData, createdAt, updatedAt
- **channels**: id, ownerId, counterpartyAddress, createdAt, updatedAt
- **messages**: id, channelId, senderAddress, encryptedContent, senderEncryptedContent, senderEd25519PubKey, senderX25519PubKey, recipientX25519PubKey, senderPubKey, recipientPubKey, senderSignature, isRead, createdAt
- **pending_deliveries**: id, tokenHash, senderAddress, recipientAddress, encryptedContent, senderEncryptedContent, senderEd25519PubKey, senderX25519PubKey, recipientX25519PubKey, senderPubKey, recipientPubKey, senderSignature, createdAt
- **used_pow**: solvedHeaderHash (PK), solvedHeader, target, expiresAt, createdAt
- **pow_log**: id, userId, algorithm, difficulty, cumulativeDifficulty, createdAt

## Route protection

Two-layer auth gate:
1. `_app.tsx` — requires logged in (any user), redirects to `/` if not
2. `_app/_saved.tsx` — requires password set, redirects to `/welcome` if not

## Epics

Epics live in `epics/`. They describe coherent goals that are larger than one
issue and track the checklist of work that should become issues or experiments.

Use epics for product or workflow directions that need multiple issues to
complete. Do not use an epic as a substitute for an issue: implementation work
still happens through issues and experiments.

See `epics/README.md` for the epic schema, index, and template. Regenerate the
epic index after creating or closing epics with:

```bash
scripts/build-epics-index.sh
```

## Issues and Experiments

Every significant concrete work item gets an issue in `issues/`. Issues describe
the problem, background, constraints, and proposed direction. Experiments are
the incremental steps that solve the issue.

The full issue index is at `issues/README.md`. Regenerate it with:

```bash
scripts/build-issues-index.sh
```

### Routing Contract

`AGENTS.md` intentionally gives only the routing-level workflow rules. Detailed
procedures live in workflow skills:

- `epics` for epic creation, updates, and closure;
- `issues-and-experiments` for the default automated experiment workflow;
- `manual-issues-and-experiments` for the manual workflow variant;
- `adversarial-review` for same-agent in-session review when explicitly chosen;
- `claude-review` and `codex-review` for explicit external review modes;
- `orthogonal-review` for cross-harness review routing.

Project skills live under `skills/`. Agent harnesses expose skills through
`.codex/skills/` and `.claude/skills/`, which are real directories containing
individual symlinks, not whole-directory symlinks. Shared skills may link to the
same `skills/<name>/` implementation. Harness-specific skills may use the same
public skill name with different targets, but the difference must be documented
in the issue or docs that introduce it.

When adding or auditing skill links, compare each agent directory against the
shared skill list and check for broken symlinks. If a link intentionally
diverges for one harness, document the exception near the change.

Non-negotiable rules:

- create or update an issue before significant work;
- every new issue README frontmatter must specify both the solution workflow
  (`workflow = "issues-and-experiments"` or
  `workflow = "manual-issues-and-experiments"`) and the reviewer
  (`review_mode = "same-agent"`, `review_mode = "external-claude"`, or
  `review_mode = "external-codex"`). New automated issues default to orthogonal
  review: Codex-authored issues use `review_mode = "external-claude"` and
  Claude-authored issues use `review_mode = "external-codex"`, with
  `review_routing = "orthogonal-review"`;
- design and conclude one experiment at a time;
- never list future experiments upfront;
- get a separate AI review before implementation and before the result commit;
- use the issue README's `review_mode` for design and completion reviews unless
  a specific experiment records a deliberate deviation;
- record the review mode, reviewer harness or command, verdict, required
  findings, and resolutions in `## Design Review` and `## Completion Review`;
- commit the reviewed plan before implementation;
- commit the reviewed result before designing the next experiment;
- record results in the experiment file and update the issue README experiment
  status;
- close issues by adding a `## Conclusion`, setting `status = "closed"` and
  `closed = "YYYY-MM-DD"` in frontmatter, and rebuilding `issues/README.md`.

### Issue Shape

Each new issue is a folder named `issues/{NNNN}-{slug}/`, where `NNNN` is the
next zero-padded issue number and the slug is lowercase hyphenated. The issue
spine is `README.md` with TOML frontmatter:

```toml
+++
status = "open"
opened = "YYYY-MM-DD"
workflow = "issues-and-experiments"
review_mode = "external-claude"
review_routing = "orthogonal-review"
+++
```

Use `workflow = "issues-and-experiments"` for the fully automated workflow and
`workflow = "manual-issues-and-experiments"` for the manual workflow. Use
orthogonal review by default for automated issues:

```toml
review_mode = "external-claude" # Codex-authored issue
review_routing = "orthogonal-review"
```

Claude-authored issues use `review_mode = "external-codex"` with the same
`review_routing`. Use `review_mode = "same-agent"` only when the user explicitly
requests same-harness in-session review or no external reviewer is available.
Closed issue frontmatter also includes `closed = "YYYY-MM-DD"`.

New issue READMEs start with a title, goal, background, and analysis or proposed
solution. A new issue does not list experiments until the first experiment is
designed.

### Future Experiment Shape

For experiments created from now on, use:

```text
exp-NNNN-{descriptive-name}.md
```

`NNNN` is zero-padded in creation order within the issue, and
`{descriptive-name}` is lowercase hyphenated. Link each experiment from the
issue README under `## Experiments` with one of these statuses: `Designed`,
`In progress`, `Pass`, `Partial`, or `Fail`.

Each experiment file contains:

1. `# Experiment {N}: {descriptive title}`
2. `## Description`
3. `## Changes`
4. `## Verification`
5. `## Design Review`, when the design review is recorded
6. `## Result` and `## Conclusion`, after implementation
7. `## Completion Review`, when the result review is recorded

### Historical Immutability

Closed issues are historical records. They are immutable and must not be
modified unless the user explicitly requests a specific historical edit.

Do not migrate, rename, rewrite, normalize, or retrofit historical issue or
experiment files to the future experiment naming convention. Older issues keep
their original shapes and filenames.
