# Guide for AI Agents Working on KeyPears

## Overview

**Decentralized Diffie-Hellman Key Exchange System**

KeyPears is a decentralized Diffie-Hellman key exchange platform that enables
secure communication between any two email addresses (e.g.,
`alice@example.com` ↔ `bob@example2.com`). Built on this foundation, it serves
as both a password manager and cryptocurrency wallet with full self-custody,
cross-device synchronization, and secure sharing. It uses a decentralized,
email-like architecture where users can run their own nodes or use hosted
providers.

**Key features:**

- Decentralized Diffie-Hellman key exchange between email addresses across
  domains
- Local-first with optional cloud sync via permissionless marketplace of
  providers
- End-to-end encrypted secret sharing between users
- Three-tier key derivation system separating authentication from encryption
- Password manager and cryptocurrency wallet built on DH exchange foundation
- Mobile-first design with cross-platform support (Windows, MacOS, Linux,
  Android, iOS)

## Intended Users

- **Cryptocurrency users**: Self-custody of passwords, wallet keys, and other
  crypto secrets
- **Business users**: Secure team secret sharing without enterprise password
  manager costs

## Intended Secrets

KeyPears supports multiple secret types:

- Passwords
- Cryptocurrency wallet keys
- API keys
- Environment variables
- SSH keys
- PGP keys

KeyPears may also be called a "secret manager", "credential manager", "key
manager", or "digital vault".

## Project Structure

Three main packages:

- **`@keypears/lib`**: Core library (data structures, cryptography)
- **`@keypears/tauri`**: Cross-platform native app (Mac, Windows, Linux,
  Android, iOS)
- **`@keypears/webapp`**: Landing page, blog, API server, and template for
  self-hosted nodes

All projects are managed with `pnpm` in a monorepo workspace
(`pnpm-workspace.yaml`).

### Folder Layout

```
lib/      - @keypears/lib source
tauri/    - @keypears/tauri source
webapp/   - @keypears/webapp source
docs/     - Documentation
```

## Development Workflow

**For all TypeScript projects**, run these commands in order from the project
directory:

1. `pnpm run lint` - Lint with ESLint
2. `pnpm run typecheck` - Type check with TypeScript
3. `pnpm run test` - Run tests with Vitest
4. `pnpm run build` - Build the package/application

All commands must pass before committing. Run for **every** TypeScript project
modified.

## Programming Languages

- **TypeScript**: Primary language for all packages (runtime: Node.js)
- **Rust**: Tauri backend code

### Essential TypeScript Patterns

- **Formatting**: `prettier`
- **Linting**: `eslint`
- **Type checking**: `typescript`
- **Testing**: `vitest`
- **API**: `orpc`
- **Validation**: `zod` (for parsing and validation)
- **Binary data**: `WebBuf` and `FixedBuf` (`@webbuf/webbuf`,
  `@webbuf/fixedbuf`)
- **UI components**: `shadcn` (with Catppuccin theme)
- **Icons**: `lucide-react` (never inline SVG)
- **Routing**: React Router with type-safe `href()` function for **all
  navigation**. Use `href()` everywhere a route URL is needed to ensure
  compile-time route validation when route files are renamed:
  - `<Link to={href("/vault/:vaultId/passwords", { vaultId })}>`
  - `navigate(href("/vault/:vaultId/passwords", { vaultId }))`
  - `redirect(href("/vault/:vaultId/passwords", { vaultId }))`
  - Any other case requiring an app route URL
  - Never use string literals or template literals for internal routes

### Rust Patterns

- Never use `unwrap` without proper error handling
- Never use unsafe code
- Always run `cargo fmt` and `cargo clippy` before committing

## Design Patterns

KeyPears has comprehensive design pattern documentation:

- **[UI/UX Patterns](docs/design-patterns-uiux.md)**: Visual design system,
  colors (Catppuccin), typography, component patterns (shadcn, buttons, inputs,
  forms), layout patterns, keyboard accessibility, interactions
- **[Code Patterns](docs/design-patterns-code.md)**: File structure, naming
  conventions, import ordering, component structure, state management with React
  Router, multi-step wizards
- **[Data Patterns](docs/design-patterns-data.md)**: Validation (Zod), database
  (ULID primary keys, Drizzle ORM), performance (debouncing, optimistic
  updates), error handling
- **[Cryptography Patterns](docs/design-patterns-crypto.md)**: Three-tier key
  derivation system, algorithms (Blake3, ACB3, AES-256), password policy,
  cross-platform WASM crypto stack

## Business, Marketing & Fundraising

KeyPears has comprehensive business strategy documentation:

- **[Business Plan](docs/business.md)**: Market opportunity, target audiences,
  business model (ads + premium + licensing), revenue projections, growth
  strategy
- **[Marketing Plan](docs/marketing.md)**: Go-to-market strategy, positioning,
  phases (crypto → developers → enterprise), text-only marketing channels,
  success metrics
- **[Fundraising Strategy](docs/fund-raising.md)**: Target investors (crypto VCs,
  OSS-friendly funds), pitch narrative, outreach strategy, timeline for
  $500k–$2M raise

## Key Technical Details

### Cryptography

- **Algorithms**: Blake3 (hashing/KDF), ACB3 (AES-256-CBC + Blake3-MAC)
- **Key derivation**: Three-tier system (password key → encryption key + login
  key)
- **Password policy**: Minimum 16 characters, default lowercase-only for mobile
  usability (~75 bits entropy)

See [`docs/design-patterns-crypto.md`](docs/design-patterns-crypto.md) for
complete details.

### Database

- **Clients**: SQLite with Drizzle ORM
- **Servers**: PostgreSQL with Drizzle ORM
- **Primary keys**: ULID (time-ordered, collision-resistant)
- **Important**: Tauri SQLite doesn't support `.returning()` - always insert
  then fetch

See [`docs/design-patterns-data.md`](docs/design-patterns-data.md) for model
patterns.

### Style & UI

- **Theme**: Catppuccin (Latte for light mode, Mocha for dark mode)
- **Primary color**: Green
- **Components**: Always use shadcn components
- **Icons**: Always use lucide-react (never inline SVG)
- **Layout**: Mobile-first, single-column design

See [`docs/design-patterns-uiux.md`](docs/design-patterns-uiux.md) for complete
UI patterns.

### Synchronization

- **Client storage**: SQLite with multiple vaults, each an append-only log of
  changes
- **Vault encryption**: Immutable 256-bit master key per vault
- **Conflict resolution**: Last-write-wins based on timestamps
- **Sync protocol**: Servers are dumb coordinators, all intelligence in clients
- **Architecture**: Email-like decentralized model

### Icons

Source PNGs in `raw-icons/` folders. Run `pnpm run build:icons` to generate
multiple sizes/formats to `public/images/` with type-safe paths in
`app/util/aicons.ts`.

### Blog (Webapp Only)

Blog posts in `webapp/docs/blog/` as Markdown with TOML front-matter:

- **Filename**: `YYYY-MM-DD-slug.md`
- **Front-matter**: TOML with `title`, `date`, `author`
- **Content**: Never include title as H1 (auto-rendered from front-matter)
- **Build**: `pnpm run build:blog` generates RSS, Atom, and JSON feeds

## Company

KeyPears is an Apache 2.0-licensed project created by Identellica LLC, a
pseudonymous identity verification service.

## Quick Start

When working on KeyPears:

1. Read the relevant design pattern docs before starting work
2. Follow the development workflow (lint → typecheck → test → build)
3. Use shadcn components and Catppuccin colors
4. Reference existing components (`PasswordGenerator`, `NewVaultName`,
   `_index.tsx`) for patterns
5. Always validate with Zod, use ULID for IDs, follow mobile-first design
