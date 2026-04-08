+++
status = "open"
opened = "2026-04-08"
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

**Rename `webapp/` to `keypears/`.**

It's the KeyPears server, not a generic webapp.

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

- The KeyPears server codebase (just renamed from `webapp/` to `keypears/`).
- The federation protocol.
- The database schema.
- All existing functionality.

### Dev topology after this change

```
keypears.test                → keypears/ (primary KeyPears server)
keypears.passapples.test     → keypears/ (same codebase, different env/db)
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

Rename `webapp/` to `keypears/`. Create `passapples/` and `lockberries/` as
minimal Bun HTTP servers that serve a landing page and a
`/.well-known/keypears.json` file. Move the passapples KeyPears server from
`passapples.test` to `keypears.passapples.test`. Update the top-level workspace
to orchestrate everything.

Third-party hosting (lockberries → keypears) doesn't need to fully work yet.
The lockberries landing page and well-known file should exist, but the KeyPears
server doesn't need to handle lockberries users until issue 0005 is
implemented.

#### Changes

**Rename `webapp/` to `keypears/`.**

- `git mv webapp keypears`.
- Update root `package.json` workspaces: `["keypears", "packages/*"]`.
- Update all paths in CLAUDE.md and docs that reference `webapp/`.

**Update `keypears/package.json` scripts.**

- `dev:keypears` stays on port 3500.
- `dev:passapples` moves to port 3512 (was 3510, now the subdomain server).
- Update env file: rename `.env.dev.passapples` and change `KEYPEARS_DOMAIN`
  to `keypears.passapples.test`.

**Create `passapples/` project.**

A minimal Bun HTTP server (`passapples/server.ts`):
- Port 3510.
- Serves `/.well-known/keypears.json` →
  `{ "apiDomain": "keypears.passapples.test" }`.
- Serves `/` → simple HTML landing page branded as KeyPears:
  "passapples.com — KeyPears test domain".
- `passapples/package.json` with `"dev"` script.

**Create `lockberries/` project.**

Same structure as passapples (`lockberries/server.ts`):
- Port 3520.
- Serves `/.well-known/keypears.json` → `{ "apiDomain": "keypears.test" }`.
- Serves `/` → simple HTML landing page:
  "lockberries.com — KeyPears test domain (hosted by keypears.com)".
- `lockberries/package.json` with `"dev"` script.

**Update root `package.json`.**

- Workspaces: `["keypears", "passapples", "lockberries", "packages/*"]`.
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
