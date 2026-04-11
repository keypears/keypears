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
docs/                     # Astro + Starlight project (replaces old docs/)
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

The `docs/` directory becomes the Astro project, replacing the current loose
markdown files. The existing content in `docs/kdf.md`, `docs/federation.md`, and
`docs/dev-setup.md` will be migrated into the Starlight content structure under
`docs/src/content/docs/`. This is similar to how `passapples/` and
`lockberries/` are standalone Astro projects.

---

## Experiment 1: Scaffold the docs site with initial content

### Hypothesis

A first-pass documentation site can be created by scaffolding an Astro +
Starlight project in `docs/`, customizing it to match the KeyPears brand, and
migrating the existing markdown docs into the Starlight content structure.

### Design

**Visual identity.** The docs site matches the KeyPears webapp brand:

- Tokyo Night base theme (light: `#e1e2e7` bg, dark: `#151a16` bg)
- Sage green accent (`hsl(109 58% 40%)` light, `hsl(115 54% 76%)` dark)
- Green-tinted neutrals for text and borders (not pure gray)
- Dark mode via `prefers-color-scheme`
- Font: Inter (same as webapp) or system sans-serif

Starlight supports custom CSS overrides for colors. The accent color and
background can be set via Starlight's color configuration or a custom CSS file
that maps to the KeyPears palette.

**Initial content.** Migrate and adapt existing docs:

1. **Welcome / Introduction** — Brief overview linking to the whitepaper. What
   KeyPears is, who it's for, how to get started.

2. **Protocol: Addressing** — Address format (`name@domain`), email
   compatibility, domain ownership = identity ownership.

3. **Protocol: Key Derivation** — Adapted from `docs/kdf.md`. Three-tier BLAKE3
   PBKDF, encryption key caching, per-key password tracking.

4. **Protocol: Encryption** — ECDH + ACB3 message encryption, vault encryption,
   vault key derivation.

5. **Protocol: Proof of Work** — pow5-64b algorithm, interactive challenges,
   configurable difficulty, authenticated challenges, replay prevention.

6. **Federation** — Adapted from `docs/federation.md`. Discovery via
   `keypears.json`, three deployment patterns, pull-model delivery.

7. **Self-Hosting** — Adapted from `docs/dev-setup.md`. Environment variables,
   database setup, Caddy reverse proxy, domain configuration.

8. **Security** — Threat model from the whitepaper expanded: server compromise,
   brute-force, spam, social-graph probing, domain spoofing, client storage
   theft, limitations.

**Dev server.** Add a `dev:docs` script to the root `package.json` and configure
Caddy to serve `docs.keypears.test` on a new port. Add the port to the
concurrently `dev` script.

### Changes

1. Move existing `docs/*.md` files to a temporary location or directly into
   `docs/src/content/docs/`.
2. Scaffold the Astro + Starlight project in `docs/`.
3. Customize Starlight theme colors to match KeyPears brand.
4. Create initial content pages from the list above.
5. Add `docs` to the bun workspace in root `package.json`.
6. Add dev server configuration (port, Caddy, concurrently).
7. Verify the site builds and runs locally at `docs.keypears.test`.

### Pass criteria

- `docs/` is a working Astro + Starlight project.
- Site builds and runs at `docs.keypears.test`.
- Brand colors match the KeyPears webapp (sage green accent, Tokyo Night base).
- At least the welcome page and one protocol page render correctly.
- Existing doc content is preserved (migrated into Starlight structure).

### Result: Pass

Astro + Starlight project scaffolded in `docs/` with 8 content pages, KeyPears
brand colors, logo in navbar, astrohacker footer, and dev server on port 3530.
Site builds (9 pages) and runs locally. However, some content from the old docs
was not fully migrated — addressed in Experiment 2.

---

## Experiment 2: Migrate all remaining content from old docs

### Hypothesis

The old `docs/` directory contained three detailed documents (`kdf.md`,
`federation.md`, `dev-setup.md`) with information that was only partially
migrated into the new Starlight docs. All information must be preserved — the
docs site covers everything, not just the protocol.

### Missing content

Comparing the old docs against the new, the following information is missing:

**From `kdf.md`:**
- Implementation section — function names and file paths (`derivePasswordKey`,
  `deriveEncryptionKeyFromPasswordKey`, etc. in `webapp/src/lib/auth.ts`)
- Key rotation mechanics — how new key pairs are generated, encrypted, and
  stored; how `loginKeyHash` tracks which password encrypted which key

**From `federation.md`:**
- `keypears.json` caching — TTL recommendation (1 hour suggested)
- Key discovery — how to look up a user's public key via `getPublicKey`
- Same-domain delivery — the simpler path when sender and recipient share a
  server
- Message structure — the fields table (`senderAddress`, `encryptedContent`,
  `senderPubKey`, `recipientPubKey`, `isRead`)
- Message size limit — 50,000 hex chars (~25KB plaintext)
- Server configuration — env vars table (`KEYPEARS_DOMAIN`,
  `KEYPEARS_API_DOMAIN`, `DATABASE_URL`, `KEYPEARS_SECRET`)

**From `dev-setup.md`:**
- The entire document — Caddy + dnsmasq local HTTPS setup, `.test` domain
  configuration, dev topology table, daily workflow

### Changes

1. **`protocol/key-derivation.md`** — Add "Implementation" section with
   function names and file paths. Add "Key rotation" section.

2. **`federation.md`** — Add caching, key discovery, same-domain delivery,
   message structure table, and message size limit sections.

3. **`self-hosting.md`** — Ensure server configuration env vars table is
   complete (already partially there).

4. **New page: `development.md`** — Local development setup adapted from
   `dev-setup.md`. Caddy + dnsmasq setup, dev topology, daily workflow. Add
   to sidebar.

### Pass criteria

- Every piece of information from the three old docs exists somewhere in the
  new docs site.
- New development page covers local HTTPS setup.
- Site builds successfully.

### Result: Pass

All content migrated. 10 pages built. However, Starlight's design is
incompatible with the KeyPears brand — the color cascade is hard to override,
the footer component system fights against custom styling, and the overall
aesthetic doesn't match the main app. Addressed in Experiment 3.

---

## Experiment 3: Rewrite as plain Astro with webapp styles

### Hypothesis

Starlight provides search and auto-generated TOC but forces a design language
that conflicts with the KeyPears brand. A plain Astro site styled with the same
Tailwind CSS and color system as the main webapp will look cohesive and give
full control over every element. Search can be added later with Pagefind
(which works on any static site, not just Starlight).

### Design

**Style source.** Copy the KeyPears webapp's visual language:

- Tailwind CSS v4 with the same `globals.css` color variables (Tokyo Night
  base, sage green accent, green-tinted neutrals)
- Same font (Inter via `@fontsource-variable/geist` or system)
- Same dark/light mode via `prefers-color-scheme`
- Same border, muted, and accent colors

**Layout.** A documentation layout with:

- Top navbar: KeyPears logo + "Docs" title, link back to keypears.com
- Left sidebar: navigation grouped by section (Protocol, Federation, etc.)
- Right area: markdown content with auto-generated heading anchors
- Footer: prev/next links + "An Astrohacker Project" branding
- Mobile: collapsible sidebar via hamburger menu

The layout should feel like a natural extension of the main app, not a
different website.

**Content.** Preserve all 9 markdown files from the Starlight site as-is. They
use standard markdown with YAML frontmatter (`title`, `description`) — no
Starlight-specific features. Move them from `src/content/docs/` to
`src/content/` (or `src/pages/` with Astro's built-in markdown support).

**Tech stack:**

- Astro (no Starlight)
- Tailwind CSS v4
- `@astrojs/mdx` for markdown rendering
- Content collections for the docs pages
- Astro components for layout (Base, DocPage, Sidebar, Footer)

### Changes

1. Remove `@astrojs/starlight` dependency.
2. Add `@astrojs/tailwind` (or Tailwind v4 via Vite plugin) and `@astrojs/mdx`.
3. Create `globals.css` copied from webapp with the same color variables.
4. Create layout components: `Base.astro`, `DocPage.astro`, `Sidebar.astro`,
   `Footer.astro`.
5. Update `astro.config.mjs` to use MDX and Tailwind instead of Starlight.
6. Move content files and update content collection config.
7. Verify all pages render correctly with the new styles.

### Pass criteria

- No Starlight dependency.
- Site builds and all 9 content pages render.
- Colors, fonts, and overall aesthetic match the main KeyPears webapp.
- Sidebar navigation works on desktop and mobile.
- Prev/next links and astrohacker footer render correctly.
- All existing content preserved.

### Result: Pass

Plain Astro + Tailwind site built with 9 pages, webapp color system, sidebar,
prev/next, and astrohacker footer. Looks far better than Starlight. However,
using a separate Astro app means we can't share React/shadcn components with
the main webapp, and hosting on a separate domain adds infrastructure
complexity. Addressed in Experiment 4.

---

## Experiment 4: Move docs into the main webapp at /docs

### Hypothesis

The simplest and most integrated approach is to serve docs as routes within the
existing TanStack Start webapp at `keypears.com/docs`. This eliminates a
separate app, a separate domain, a separate build, and a separate deployment.
The docs pages use the same React components, the same shadcn UI, the same
Sidebar, and the same Footer as the rest of the app. Logged-in users see the
docs with their session intact; logged-out users see the docs without needing
to authenticate.

### Design

**Route structure.** Docs live under a `_docs` layout route that provides a
documentation-specific layout (sidebar navigation, content area) without
requiring authentication. The layout is separate from `_app` (which requires
login).

```
webapp/src/routes/
  _docs.tsx                    # docs layout (sidebar + content, no auth)
  _docs/
    docs.tsx                   # /docs — welcome page
    docs.protocol.addressing.tsx
    docs.protocol.key-derivation.tsx
    docs.protocol.encryption.tsx
    docs.protocol.proof-of-work.tsx
    docs.federation.tsx
    docs.self-hosting.tsx
    docs.security.tsx
    docs.development.tsx
```

**Content.** The markdown content from `docs/src/content/docs/` is converted
into React components. Options:

1. Use `@mdx-js/rollup` to import `.mdx` files directly as components.
2. Convert each markdown file to a React component with JSX.
3. Use a runtime markdown renderer like `react-markdown`.

Option 1 (MDX) is cleanest — the content stays as markdown with JSX support,
and TanStack Start's Vite build handles the compilation.

**Layout.** The `_docs.tsx` layout provides:

- The existing Sidebar component (or a docs-specific variant) with doc
  navigation
- The existing Footer component with astrohacker branding
- A content area styled with Tailwind typography (`prose`)
- No authentication requirement — uses `getSessionUserId()` (optional auth)
  so logged-in users see their session but logged-out users aren't redirected

**Shared components.** The docs pages can use any component from the webapp:
shadcn buttons, tables, code blocks, the Sidebar, the Footer, PowBadge, etc.
This opens the door to interactive documentation (e.g., a live PoW demo, an
address validator, a KDF calculator).

**Delete the Astro docs app.** Remove `docs/` entirely. Remove `docs` from the
bun workspace. Remove `dev:docs` from root `package.json`. Remove
`docs.keypears.test` from CLAUDE.md dev topology.

### Changes

1. Add `@mdx-js/rollup` to webapp dependencies and configure in Vite.
2. Create `_docs.tsx` layout route (sidebar, no auth required).
3. Move markdown content from `docs/src/content/docs/` to
   `webapp/src/routes/_docs/` as `.mdx` files (or convert to components).
4. Create route files for each docs page.
5. Delete `docs/` directory entirely.
6. Remove `docs` from workspace, `dev:docs` from root scripts, and
   `docs.keypears.test` from CLAUDE.md.
7. Verify all docs pages render at `/docs/*`.

### Pass criteria

- `docs/` directory is deleted.
- All 9 docs pages render at `/docs`, `/docs/protocol/addressing`, etc.
- Docs are accessible without login.
- Docs use the same components and styles as the rest of the webapp.
- The existing app routes are unaffected.
- Tests and linter pass.

### Result: Pass

Astro docs app deleted. All 9 docs pages render as TanStack Start routes at
`/docs/*` using `react-markdown` for rendering. Separate `_docs` layout with
its own sidebar and navbar. Linter: 0 errors, tests: 7/7 passed. However, the
docs are isolated from the main app — separate layout, separate sidebar,
separate navbar. Addressed in Experiment 5.

---

## Experiment 5: Integrate docs into the main app chrome

### Hypothesis

The docs should feel like part of the main app, not a separate site bolted on.
The same Sidebar, Footer, and user dropdown used in the authenticated app
should appear on docs pages. Docs should be accessible to everyone (logged in
or not), but logged-in users see their session.

### Design

**Sidebar integration.** The existing `Sidebar` component gets a "Docs" nav
item (with a `BookOpen` icon) that links to `/docs`. When the user is on a
`/docs/*` route, the sidebar switches to show docs navigation:

- "Home" at the top (links back to `/home` or `/` depending on auth state)
- Then the docs nav items grouped by section (Protocol, Federation, etc.)

This mirrors how the sidebar already changes context for channel and vault
detail pages.

**Route structure.** Remove the `_docs` layout route. Instead, docs pages use
the existing `_app/_saved/_chrome` layout (for logged-in users with passwords)
OR a new public layout that shows the sidebar without requiring auth.

The cleanest approach: make docs a top-level layout `_docs.tsx` that reuses
the same `Sidebar` component but with docs-specific nav items, and uses
optional auth (not required). The Sidebar component needs to accept a `mode`
prop: `"app"` (current behavior) or `"docs"` (docs nav items).

**Auth states for docs:**

1. *Logged in + password set:* Full sidebar with user dropdown, address, docs
   nav. User menu has all options (Profile, Keys, Domains, Settings, Password,
   Log out).
2. *Logged in + no password:* Sidebar with user dropdown. User menu has only
   Log out.
3. *Not logged in:* Sidebar with logo and docs nav. No user dropdown. No
   address.

**Footer.** The existing `Footer` component already shows "Terms · Privacy".
Add "Docs" link: "Terms · Privacy · Docs". This ensures `/docs` is
discoverable from every page, including the logged-out landing page.

**Landing page.** The logged-out landing page (`index.tsx`) footer already has
Terms and Privacy. Add Docs there too.

**Navigation to/from docs:**

- Main app → Docs: Click "Docs" in the sidebar nav items.
- Docs → Main app: Click "Home" in the docs sidebar, which links to `/home`
  (if logged in) or `/` (if not).

### Changes

1. **`Sidebar.tsx`** — Add `mode` prop (`"app" | "docs"`). When `"docs"`, show
   docs nav items instead of app nav items (Home/Inbox/Send/Vault). Add
   "Docs" to the app nav items list. Keep Logo, Address, UserDropdown, and
   mobile drawer behavior unchanged.

2. **`_docs.tsx`** — Rewrite to use the `Sidebar` component with `mode="docs"`
   and optional auth. Use `getSessionUserId()` to detect login state. Load
   user data if logged in. Pass user info to Sidebar (or null if logged out).

3. **`Footer.tsx`** — Add "Docs" link between Privacy and the copyright line.

4. **`DocsContent.tsx`** — Remove the separate prev/next nav (the Sidebar
   provides navigation). Or keep it — your call.

5. **Delete `DocsSidebar.tsx`** — No longer needed; the main Sidebar handles
   both modes.

### Pass criteria

- "Docs" appears in the main app sidebar nav items.
- Docs pages use the main Sidebar with docs-specific nav items.
- Logged-in users see their user dropdown on docs pages.
- Logged-out users see docs without being redirected to login.
- Footer on all pages includes a "Docs" link.
- Tests and linter pass.
