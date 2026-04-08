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
