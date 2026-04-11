+++
status = "open"
opened = "2026-04-11"
+++

# Documentation site at docs.keypears.com

## Goal

Create a documentation site at `docs.keypears.com` (locally
`docs.keypears.test`) for detailed protocol documentation, server administration
guides, and API reference. The whitepaper provides an 8-page overview; the docs
site provides everything needed to understand, implement, and operate KeyPears.

## Background

The whitepaper at `keypears.com/keypears.pdf` is an architectural overview aimed
at developers and security researchers evaluating the system. It is deliberately
concise. Detailed documentation — how to run a server, how federation works step
by step, the full API surface, key derivation internals — needs a dedicated
site.

### Hosting

The docs site will be hosted on Cloudflare Pages at `docs.keypears.com`. Locally
it runs at `docs.keypears.test` via the existing Caddy + dnsmasq dev setup.
Documentation deploys are independent from app deploys.

### Framework

Astro with Starlight (Astro's official docs theme). Starlight provides:

- Markdown/MDX pages with automatic sidebar navigation from file structure
- Built-in search, dark mode, mobile-responsive layout
- Ability to drop into HTML/Astro components via MDX when needed
- Static output suitable for Cloudflare Pages

### Content sources

Existing documentation that should be migrated or adapted:

- `docs/kdf.md` — key derivation system (detailed)
- `docs/federation.md` — federation model, pull delivery, PoW (detailed)
- `docs/dev-setup.md` — local HTTPS via Caddy + dnsmasq
- `CLAUDE.md` — project structure, tech stack, conventions (partial)
- `whitepaper/keypears.typ` — protocol overview (reference, not copied)

### Planned sections

1. **Getting Started** — What is KeyPears, create an account, send a message
2. **Self-Hosting** — Run your own server, environment variables, database
   setup, Caddy configuration
3. **Federation** — How domains discover each other, `keypears.json`, deployment
   patterns, pull-model delivery, domain claiming
4. **Protocol** — Address format, key derivation, encryption (ECDH + ACB3),
   proof of work, session management
5. **API Reference** — oRPC procedures (server-to-server and client-to-server)
6. **Security** — Threat model, key management, password change, limitations

### Project structure

```
docs/                     # existing docs (source material)
docs-site/                # new Astro + Starlight project
  src/
    content/
      docs/
        getting-started.md
        self-hosting.md
        federation.md
        protocol/
          addressing.md
          key-derivation.md
          encryption.md
          proof-of-work.md
          sessions.md
        api-reference.md
        security.md
  astro.config.mjs
  package.json
```

The `docs-site/` directory is a standalone Astro project in the repo root,
similar to `passapples/` and `lockberries/`.
