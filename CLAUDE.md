# Keypears

A private account manager where your user ID is your keypear number.

## Tech stack

- **Framework**: TanStack Start, TanStack Router, React 19
- **Database**: Drizzle ORM, MySQL (local homebrew for dev, PlanetScale for prod)
- **Styling**: Tailwind CSS v4 with Tokyo Night theme, shadcn components
- **Auth**: SHA-256 PBKDF password hashing (client-side + server-side, 300k total rounds), session cookies
- **Crypto**: secp256k1 key pairs, ACS2 encryption (`@webbuf/*` libraries)
- **Env**: dotenvx for encrypted env management (`.env.dev` for local, `.env.prod` for production)
- **Linting**: oxlint
- **Formatting**: Prettier with prettier-plugin-tailwindcss
- **Image processing**: Sharp for multi-size WebP generation with type-safe paths
- **Package manager**: bun
- **Runtime**: Bun

## Development

```bash
bun install
bun dev            # starts on port 3001
bun run db:push    # push schema to MySQL
bun run build:icons # regenerate images from raw-icons/
bun run lint
bun run format
```

Local MySQL required (homebrew). Database config is in `.env.dev` (encrypted with dotenvx). Decryption keys are in `.env.keys` (gitignored).

## Project structure

```
src/
  routes/           # TanStack Router file-based routes
    __root.tsx      # root layout
    index.tsx       # 3D welcome page (ssr: false)
    home.tsx        # authenticated dashboard
    login.tsx       # login form (keypear # + password)
    save.tsx        # save keypear (set password + generate key pair)
    $profile.tsx    # profile page (/@N), catch-all with @ prefix check
  components/
    WelcomePage.tsx # Three.js 3D scene
    Navbar.tsx      # top nav with avatar dropdown menu
    ui/             # shadcn components (avatar, button, dropdown-menu)
  server/
    keypears.functions.ts  # createServerFn wrappers (safe to import from client)
    keypears.server.ts     # DB logic (server-only, never imported by client)
  db/
    schema.ts       # Drizzle schema (keypears table)
    index.ts        # MySQL connection pool
  lib/
    auth.ts         # client-side KDF (deriveLoginKey, generateAndEncryptKeyPair)
    icons.ts        # auto-generated type-safe image paths
    utils.ts        # shadcn utility (cn)
raw-icons/          # source PNGs for image processing
public/images/      # generated WebP images
```

## Key conventions

- Use a single `DATABASE_URL` env var for database connections, not separate DB_* vars.
- Use `dotenvx run -f .env.dev --` to wrap commands that need env vars.
- Server functions follow the two-file pattern:
  - `*.functions.ts` — `createServerFn` wrappers, safe to import from client code
  - `*.server.ts` — actual DB/crypto logic, only imported inside handler bodies
- Routes that use browser-only code (Three.js, WebGL) must set `ssr: false`.
- Use `$icon()` from `~/lib/icons` for type-safe image paths.
- Use shadcn components for UI where appropriate.

## Issues and experiments

Every significant piece of work gets an issue in `issues/`. Issues describe the
problem, provide background, and propose solutions. Experiments are the
incremental steps that solve the problem.

### Issue structure

Each issue is a **folder** containing a `README.md` with TOML frontmatter:

```
issues/0001-some-topic/
├── README.md          ← main issue document with frontmatter
├── 01-sub-topic.md    ← optional: additional files for long issues
└── 02-sub-topic.md
```

The folder name is `{number}-{slug}`. The number is 4-digit, globally sequential.
The slug is lowercase, hyphenated, and describes the topic.

#### Frontmatter

Every `README.md` starts with TOML frontmatter:

```
+++
status = "open"
opened = "2026-04-02"
+++
```

Or for closed issues:

```
+++
status = "closed"
opened = "2026-04-02"
closed = "2026-04-03"
+++
```

#### README.md structure

After the frontmatter, a new issue has these sections:

1. **Title** (H1) — `# Issue {N}: {descriptive title}`
2. **Goal** — One or two sentences describing the desired outcome.
3. **Background** — Context, prior work, constraints.
4. **Architecture** / **Analysis** / **Proposed Solutions** — Technical details.

A new issue does **not** have an Experiments section yet.

#### Additional files

For long issues, split experiments or sub-topics into numbered files:
`01-name.md`, `02-name.md`, etc. Link them from the README.md. Keep each file
under ~1000 lines to fit in an AI agent's context window.

### Multiple open issues

Multiple issues can be open at the same time. This allows interleaving work —
a large issue can stay open while smaller issues are opened and closed alongside
it.

### Experiments

#### When to create an experiment

Only after the issue's requirements are clear. Each experiment is designed,
implemented, and concluded before the next one is designed.

**Never list experiments upfront.** The outcome of each experiment informs what
comes next.

#### Experiment structure

Each experiment has:

1. **Title** (H3) — `### Experiment {N}: {descriptive title}`
2. **Description** — What and why.
3. **Changes** — Specific code changes, listed by file.
4. **Verification** — How to test. Concrete steps and pass/fail criteria.

#### One at a time

Design and implement one experiment at a time. The result of Experiment 1
directly informs what Experiment 2 should be.

#### Recording results

After testing, add a result below the verification section:

```markdown
**Result:** Pass / Partial / Fail

{description}

#### Conclusion

{what we learned, what to do next}
```

All three outcomes are valuable. Failed experiments eliminate dead ends.

### Closing an issue

Add a `## Conclusion` section after the last experiment. Update the frontmatter
to `status = "closed"` with a `closed` date.

### Immutability

Closed issues are historical records. They are **immutable** and must NEVER be
modified. History stays as it was written.

### Process summary

1. **Create the issue** — `issues/{number}-{slug}/README.md` with frontmatter,
   goal, background. No experiments yet.
2. **Design Experiment 1** — Add `## Experiments` and `### Experiment 1`.
3. **Implement Experiment 1** — Write the code.
4. **Record the result** — Pass, partial, or fail with a conclusion.
5. **Repeat** — Design the next experiment. Continue until the goal is met.
6. **Close the issue** — Write the `## Conclusion`, update frontmatter.

### Rebuilding the index

Run `bash scripts/build-issues-index.sh` to regenerate `issues/README.md`.

## Auth flow

1. User clicks "Begin Your Journey" → assigned a keypear number (auto-increment MySQL ID) → cookie set (24h expiry)
2. User can save their number by setting a password on `/save`
3. On save: client derives login key (SHA-256 PBKDF, 200k rounds), generates secp256k1 key pair, encrypts private key with ACS2 → sends login key + public key + encrypted private key to server
4. Server hashes login key (another 100k rounds), stores everything, sets cookie to 2-year expiry
5. Unclaimed numbers expire after 24 hours and are recycled to new users
6. Login via `/login` with keypear number + password
