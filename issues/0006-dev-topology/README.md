+++
status = "closed"
opened = "2026-04-08"
closed = "2026-04-08"
+++

# Issue 6: Dev Topology for Three Deployment Patterns

## Goal

Restructure the development environment to test all three real-world KeyPears
deployment patterns: primary self-hosting, subdomain self-hosting, and
third-party hosting via a custom domain.

## Background

Currently the dev setup has two servers: `keypears.test` (primary) and
`passapples.test` (alternate). Both are full KeyPears servers running on their
own domains. This doesn't reflect how KeyPears will actually be deployed.

In reality:

- **Primary hosting** (`keypears.com`): The KeyPears company runs the main
  server. Users sign up directly. This is like Gmail.

- **Subdomain self-hosting** (`keypears.passapples.com`): A business runs their
  own KeyPears node on a subdomain. Their main domain (`passapples.com`) is
  their existing website/app — they're not going to replace it with KeyPears.
  The KeyPears server lives on a subdomain, just like email lives on
  `mail.acme.com`. The main domain has a landing page and a
  `.well-known/keypears.json` pointing to the subdomain.

- **Third-party hosted** (`lockberries.com`): A domain owner doesn't run any
  server. They put a `.well-known/keypears.json` on their domain pointing to
  `keypears.com` as the host. Users at `@lockberries.com` are served by the
  keypears.com server. This is like Google Workspace with a custom domain.

### What needs to change

**Move the passapples KeyPears server to a subdomain.**

The passapples KeyPears server should run at `keypears.passapples.test`, not
`passapples.test`. The main `passapples.test` domain becomes a simple landing
page with a `.well-known/keypears.json` pointing to `keypears.passapples.test`.

**Create `passapples/` project.**

A minimal static site for `passapples.test`:

- Landing page branded as KeyPears, says something like "passapples.com —
  KeyPears test domain".
- Serves `/.well-known/keypears.json` with
  `{ "apiDomain": "keypears.passapples.test" }`.

**Create `lockberries/` project.**

A minimal static site for `lockberries.test`:

- Landing page branded as KeyPears, says something like "lockberries.com —
  KeyPears test domain (third-party hosted)".
- Serves `/.well-known/keypears.json` with `{ "apiDomain": "keypears.test" }`.
- No KeyPears server, no database. Just a static site with the well-known file.

**Update top-level bun workspace.**

The monorepo root should orchestrate all projects:

- `bun dev` — starts all servers concurrently (keypears, passapples landing,
  lockberries landing, and the keypears-on-passapples subdomain server).
- `bun run db:clear` — clears all databases.
- `bun run db:push` — pushes schema to all databases.

**Update Caddy/dnsmasq config.**

Add new domains:

- `keypears.passapples.test` — reverse proxy to the passapples KeyPears server.
- `lockberries.test` — reverse proxy to the lockberries landing page.
- `passapples.test` — now points to the passapples landing page (not the
  KeyPears server).

**Update CLAUDE.md and docs.**

Reflect the new structure and the three deployment patterns.

### What stays the same

- The KeyPears server codebase (`webapp/`).
- The federation protocol.
- The database schema.
- All existing functionality.

### Dev topology after this change

```
keypears.test                → webapp/ (primary KeyPears server)
keypears.passapples.test     → webapp/ (same codebase, different env/db)
passapples.test              → passapples/ (landing page + well-known)
lockberries.test             → lockberries/ (landing page + well-known)
```

Three domains, three deployment patterns, one `bun dev` command.

### Caddy ports

```
keypears.test              → localhost:3500
passapples.test            → localhost:3510
keypears.passapples.test   → localhost:3512
lockberries.test           → localhost:3520
```

## Experiments

### Experiment 1: Restructure repo and create landing pages

#### Description

Create `passapples/` and `lockberries/` as
minimal Astro static sites that serve a landing page and a
`/.well-known/keypears.json` endpoint. Move the passapples KeyPears server from
`passapples.test` to `keypears.passapples.test`. Update the top-level workspace
to orchestrate everything.

Astro is used for the landing pages because they will be hosted on Cloudflare
in production (Astro has first-class Cloudflare Pages support). See
`~/dev/rxc/homepage` for a working `.well-known/keypears.json.ts` endpoint
example, and `~/dev/yafujifide` for a minimal Astro landing page.

Third-party hosting (lockberries → keypears) doesn't need to fully work yet.
The lockberries landing page and well-known file should exist, but the KeyPears
server doesn't need to handle lockberries users until issue 0005 is
implemented.

#### Changes

**Update `webapp/package.json` scripts.**

- `dev:keypears` stays on port 3500.
- `dev:passapples` moves to port 3512 (was 3510, now the subdomain server).
- Update env file: `.env.dev.passapples` changes `KEYPEARS_DOMAIN` to
  `keypears.passapples.test`.

**Create `passapples/` project.**

A minimal Astro static site styled identically to the main KeyPears landing
page (same colors, logo, dark/light mode, layout). Instead of "Create an
Account" / "Log in", shows "passapples.com" as subtitle and links to the
KeyPears server at `keypears.passapples.test` (dev) / `keypears.passapples.com`
(prod):
- `astro.config.mjs` — static output, Tailwind CSS via Vite plugin.
- `src/pages/index.astro` — KeyPears-branded landing page with link:
  "Go to KeyPears" → `https://keypears.passapples.test`.
- `src/pages/.well-known/keypears.json.ts` — GET endpoint returning
  `{ "apiDomain": "keypears.passapples.test" }` (dev) or
  `keypears.passapples.com` (prod), using `import.meta.env.PROD`.
- `src/styles/style.css` — same theme variables as the main KeyPears app.
- `package.json` with `"dev": "astro dev --port 3510"`.
- Copy keypears logo + favicon files to `public/` for branding.

**Create `lockberries/` project.**

Same Astro structure and styling as passapples, but links to `keypears.test`
(dev) / `keypears.com` (prod) since lockberries is third-party hosted:
- `src/pages/index.astro` — KeyPears-branded landing page with link:
  "Go to KeyPears" → `https://keypears.test`.
  Subtitle: "lockberries.com".
- `src/pages/.well-known/keypears.json.ts` — GET endpoint returning
  `{ "apiDomain": "keypears.test" }` (dev) or `keypears.com` (prod).
- `package.json` with `"dev": "astro dev --port 3520"`.

**Update root `package.json`.**

- Workspaces: `["webapp", "passapples", "lockberries", "packages/*"]`.
- Scripts:
  - `dev` — runs all four servers concurrently via `concurrently`:
    keypears (3500), passapples landing (3510), keypears-on-passapples (3512),
    lockberries landing (3520).
  - `db:clear` — clears keypears + passapples databases.
  - `db:push` — pushes schema to keypears + passapples databases.

**Update Caddy config in docs.**

Document the four-domain Caddyfile with the correct port mappings.

#### Verification

1. `bun dev` from repo root starts all four servers.
2. `https://keypears.test` — full KeyPears server, create account, log in.
3. `https://passapples.test` — landing page, "passapples.com — KeyPears test
   domain".
4. `https://passapples.test/.well-known/keypears.json` →
   `{ "apiDomain": "keypears.passapples.test" }`.
5. `https://keypears.passapples.test` — full KeyPears server (passapples
   instance), create account, log in.
6. `https://lockberries.test` — landing page, "lockberries.com — KeyPears test
   domain (hosted by keypears.com)".
7. `https://lockberries.test/.well-known/keypears.json` →
   `{ "apiDomain": "keypears.test" }`.
8. Federation works: send a message from `alice@keypears.test` to
   `bob@keypears.passapples.test`.
9. `bun run db:clear && bun run db:push` from root manages both databases.

**Result:** Fail

#### Conclusion

The landing pages and workspace orchestration work correctly. However, the
experiment exposed a fundamental design flaw: `KEYPEARS_DOMAIN` conflates two
separate concepts — the **server domain** (where the app runs, e.g.
`keypears.passapples.test`) and the **address domain** (what goes after `@` in
user addresses, e.g. `passapples.test`). These are not the same thing. A
KeyPears server at `keypears.passapples.test` should create users with
addresses like `alice@passapples.test`, not `alice@keypears.passapples.test`.
This is how email works: Gmail runs at `smtp.gmail.com` but addresses are
`user@gmail.com`. The next experiment must fix this separation before the
topology can work correctly.

### Experiment 2: Separate address domain from API domain

#### Description

Split `KEYPEARS_DOMAIN` (address domain) from the new `KEYPEARS_API_DOMAIN`
(where the server runs). Both env vars are required. They have different
meanings and almost every deployment will have different values for each.

- `KEYPEARS_DOMAIN` — the address domain. Goes after `@` in user addresses.
  Example: `passapples.test`. Used for constructing addresses, login
  validation, the welcome page, name availability checks.
- `KEYPEARS_API_DOMAIN` — where this server's API runs. Example:
  `keypears.passapples.test`. Used for the `keypears.json` response, the oRPC
  API URL, and federation's local domain check.

For the primary server (keypears.test), both are the same value. For the
passapples server, they differ: `KEYPEARS_DOMAIN=passapples.test`,
`KEYPEARS_API_DOMAIN=keypears.passapples.test`.

#### Changes

**`webapp/src/lib/config.ts`:**

- `getDomain()` stays — reads `KEYPEARS_DOMAIN`. Used for address
  construction, welcome page, login.
- Add `getApiDomain()` — reads `KEYPEARS_API_DOMAIN`. Used for the
  `keypears.json` response and federation local domain check.
- `apiUrlFromDomain(domain)` stays — constructs `https://{domain}/api`.

**`webapp/src/server.ts`** — `keypears.json` endpoint:

- Serve `apiDomain: getApiDomain()` instead of `apiDomain: getDomain()`.

**`webapp/src/server/wellknown.functions.ts`:**

- Same: return `apiDomain: getApiDomain()`.

**`webapp/src/server/federation.server.ts`:**

- `resolveApiUrl` local check: use `isLocalDomain` (checks the `domains`
  table, unchanged). When local, return `apiUrlFromDomain(getApiDomain())`
  — the local API URL uses the API domain, not the address domain.

**`webapp/src/server/api.router.ts`:**

- `serverInfo` endpoint: return `domain: getDomain()` (address domain, for
  display). Could also return `apiDomain: getApiDomain()` if useful.

**`webapp/src/server/user.functions.ts`:**

- `checkNameAvailable`, `saveMyUser`, `login` — these use `getDomain()` for
  address construction. No change needed — `getDomain()` still returns the
  address domain.
- `getOrCreateDomain(getDomain())` — creates the address domain in the
  `domains` table. Correct, no change.

**`webapp/src/server/config.functions.ts`:**

- `getServerDomain()` returns `getDomain()` — this is the address domain shown
  in the UI (welcome page, login page). Correct, no change.

**`webapp/.env.dev`:**

Already updated: `KEYPEARS_DOMAIN=keypears.test`,
`KEYPEARS_API_DOMAIN=keypears.test`.

**`webapp/.env.dev.passapples`:**

Already updated: `KEYPEARS_DOMAIN=passapples.test`,
`KEYPEARS_API_DOMAIN=keypears.passapples.test`.

#### Verification

1. keypears.test: create account as `alice@keypears.test` — address uses
   `keypears.test`, not `keypears.passapples.test`.
2. keypears.passapples.test: create account as `bob@passapples.test` — address
   uses `passapples.test`, not `keypears.passapples.test`.
3. `https://keypears.test/.well-known/keypears.json` →
   `{ "apiDomain": "keypears.test" }`.
4. `https://keypears.passapples.test/.well-known/keypears.json` →
   `{ "apiDomain": "keypears.passapples.test" }`.
5. Federation works: send a message from `alice@keypears.test` to
   `bob@passapples.test`.
6. `passapples.test/.well-known/keypears.json` →
   `{ "apiDomain": "keypears.passapples.test" }` (served by Astro landing).
7. Login at keypears.passapples.test accepts `bob@passapples.test`, not
   `bob@keypears.passapples.test`.

**Result:** Pass

#### Conclusion

Added `KEYPEARS_API_DOMAIN` env var to separate the server domain from the
address domain. The address domain (`KEYPEARS_DOMAIN`) goes after `@` in user
addresses. The API domain (`KEYPEARS_API_DOMAIN`) is where the server runs and
what gets served in `keypears.json`. For the primary server both are the same.
For subdomain deployments they differ. Federation between keypears.test and
passapples.test works correctly — addresses use the parent domain, not the
subdomain.

## Conclusion

The dev environment now tests all three real-world deployment patterns:

1. **Primary self-hosting** (`keypears.test`) — the KeyPears server owns its
   domain directly. Address domain and API domain are the same.

2. **Subdomain self-hosting** (`keypears.passapples.test`) — a business runs
   KeyPears on a subdomain. Addresses are `@passapples.test`, the server runs
   at `keypears.passapples.test`. The landing page at `passapples.test` serves
   `keypears.json` pointing to the subdomain.

3. **Third-party hosted** (`lockberries.test`) — landing page and
   `keypears.json` exist, pointing to `keypears.test` as the host. Full
   third-party hosting is not yet implemented (see issue 0005) but the
   infrastructure is in place.

Key changes: split `KEYPEARS_DOMAIN` (address) from `KEYPEARS_API_DOMAIN`
(server), created Astro landing pages for passapples and lockberries, unified
`bun dev` to run all four servers concurrently.
