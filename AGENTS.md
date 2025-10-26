# Guide for AI Agents Working on KeyPears

> **Note**: `CLAUDE.md` is a symlink to this file (`AGENTS.md`). Only edit
> `AGENTS.md` - changes will automatically appear in `CLAUDE.md`.

## Overview

**Decentralized Diffie-Hellman Key Exchange System**

KeyPears is a decentralized Diffie-Hellman key exchange platform that enables
secure communication between any two email addresses (e.g., `alice@example.com`
↔ `bob@example2.com`). Built on this foundation, it serves as both a password
manager and cryptocurrency wallet with full self-custody, cross-device
synchronization, and secure sharing. It uses a decentralized, email-like
architecture where users can run their own nodes or use hosted providers.

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

Five main packages:

- **`@keypears/lib`** (TypeScript): Core TypeScript library (data structures,
  cryptography utilities)
- **`rs-lib`** (Rust): Core Rust library (cryptography implementations, shared
  utilities)
- **`rs-node`** (Rust): KeyPears node (backend API server) using rs-lib - binary
  name: `keypears-node`
- **`@keypears/api-client`** (TypeScript): Type-safe API client for consuming
  the KeyPears node API
- **`@keypears/tauri`** (Rust + TypeScript): Cross-platform native app (Mac,
  Windows, Linux, Android, iOS)
- **`@keypears/webapp`** (TypeScript): Landing page, blog, and template for
  self-hosted nodes

All TypeScript projects are managed with `pnpm` in a monorepo workspace
(`pnpm-workspace.yaml`). All Rust projects are managed with `cargo` in a
workspace (`Cargo.toml` at root).

### Folder Layout

All source folders are prefixed with their language (`ts-*` for TypeScript,
`rs-*` for Rust):

```
ts-lib/             - @keypears/lib source (TypeScript)
rs-lib/             - rs-lib source (Rust library)
rs-node/            - KeyPears node source (Rust binary using rs-lib)
ts-api-client/      - @keypears/api-client source (TypeScript)
ts-tauri/           - @keypears/tauri source (TypeScript frontend)
  └── src-tauri/    - Symlink to ../rs-tauri (for Tauri CLI compatibility)
rs-tauri/           - @keypears/tauri source (Rust backend)
ts-webapp/          - @keypears/webapp source (TypeScript)
  ├── bin/          - Pre-built KeyPears node binary (cross-compiled for Linux)
  └── start.sh      - Production startup script (runs both node + webapp)
docs/               - Documentation
whitepaper/         - Technical whitepaper (Typst format)
  └── keypears.typ  - Main whitepaper document
scripts/            - Build and deployment scripts
  ├── setup-cross-compile.sh  - One-time setup for cross-compilation
  └── build-api-linux.sh      - Cross-compile KeyPears node for Linux
Cargo.toml          - Rust workspace configuration
Dockerfile          - Production Docker build (multi-stage, monorepo-aware, linux/amd64)
docker-compose.yml  - Docker Compose config (platform: linux/amd64 for Apple Silicon)
package.json        - Root-level pnpm scripts (build, webapp, deployment)
pnpm-workspace.yaml - TypeScript monorepo workspace configuration
.cargo/config.toml  - Cargo cross-compilation configuration
```

## Development Workflow

### TypeScript Projects

**For all TypeScript projects**, run these commands in order from the project
directory:

1. `pnpm run lint` - Lint with ESLint
2. `pnpm run typecheck` - Type check with TypeScript
3. `pnpm run test` - Run tests with Vitest
4. `pnpm run build` - Build the package/application

All commands must pass before committing. Run for **every** TypeScript project
modified.

### Rust Projects

**For all Rust projects**, run these commands in order from the root directory:

1. `cargo fmt --all` - Format code with rustfmt
2. `cargo clippy --all-targets --all-features` - Lint with Clippy
3. `cargo test --all` - Run all tests
4. `cargo build --all` - Build all workspace members

All commands must pass before committing. Run for **every** Rust project
modified.

### Cross-Compilation for Production

The KeyPears node must be cross-compiled for Linux (x86_64-unknown-linux-musl)
before deployment:

1. **One-time setup**: `bash scripts/setup-cross-compile.sh`
2. **Build for Linux**: `pnpm run build:api` (runs `scripts/build-api-linux.sh`)
3. **Build all packages**: `pnpm run build:all` (builds KeyPears node +
   TypeScript packages + Docker image)

The deployment pipeline automatically handles cross-compilation via
`pnpm run
deploy:all`.

## Programming Languages

- **TypeScript**: Frontend, API client, and webapp server (runtime: Node.js)
- **Rust**: KeyPears node (backend API), core cryptography library, and Tauri
  native app backend

### Backend Architecture

The backend is being built entirely in Rust for performance, security, and
cross-platform compatibility:

- **`rs-lib`**: Shared Rust library containing cryptography implementations
  (Blake3, ACB3), data structures, and utilities
- **`rs-node` (binary: `keypears-node`)**: Axum-based REST API server that uses
  `rs-lib` for all core operations. This is the KeyPears node that can be run by
  anyone.
- **OpenAPI**: Full OpenAPI 3.0 specification generated from Rust code using
  `utoipa`, with Swagger UI at `/api/docs`
- **Current status**: Proof-of-concept complete with Blake3 hashing endpoint
  (`/api/blake3`)
- **Future work**: All backend cryptography, vault operations, and sync protocol
  will be implemented in Rust and exposed via REST API
- **Branding**: The API server is called a "KeyPears node" to emphasize the
  decentralized, network-oriented architecture similar to cryptocurrency nodes

### Essential TypeScript Patterns

- **Formatting**: `prettier`
- **Linting**: `eslint`
- **Type checking**: `typescript`
- **Testing**: `vitest`
- **API client**: `@keypears/api-client` (type-safe client for Rust backend)
- **Validation**: `zod` (for parsing and validation)
- **Binary data**: `WebBuf` and `FixedBuf` (`@webbuf/webbuf`,
  `@webbuf/fixedbuf`)
  - **`WebBuf`**: IS a Uint8Array with extra methods like `.toHex()`,
    `.toBase64()`, `.toUtf8()`
  - **`FixedBuf<N>`**: Container with `.buf` property (which is a WebBuf) for
    fixed-size data like hashes
  - Example: `FixedBuf<32>` for Blake3 hashes (32 bytes)
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

### Essential Rust Patterns

- **Web framework**: `axum` (modern, type-safe HTTP framework from Tokio team)
- **OpenAPI**: `utoipa` + `utoipa-axum` + `utoipa-swagger-ui` for compile-time
  validated API documentation
- **Serialization**: `serde` with `#[derive(Serialize, Deserialize)]`
- **Testing**: Built-in `#[cfg(test)]` modules with `#[test]` functions
- **Error handling**: Never use `unwrap()` without proper error handling; prefer
  `?` operator and `Result<T, E>`
- **Safety**: Never use `unsafe` code
- **Code quality**: Always run `cargo fmt` and `cargo clippy` before committing
- **Cryptography**: Use `rs-lib` for all crypto operations (Blake3, ACB3, etc.)

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
- **[Fundraising Strategy](docs/fund-raising.md)**: Target investors (crypto
  VCs, OSS-friendly funds), pitch narrative, outreach strategy, timeline for
  $500k–$2M raise

## Deployment

- **[Deployment Guide](docs/deployment.md)**: Complete AWS Fargate deployment
  guide with Docker containerization, ECR, ECS, ALB, Route 53, and SSL

### Deployment Commands

- **`pnpm deploy:all`** - Full deployment: cross-compile Rust API → build all
  packages → build Docker image (linux/amd64) → push to ECR → redeploy on ECS
  Fargate
- **`pnpm deploy:build`** - Build and push to ECR only (no redeployment)
- **`pnpm deploy:update`** - Force ECS redeployment without rebuilding
- **`pnpm build:all`** - Build everything: Rust API (cross-compile) + TypeScript
  packages + Docker image
- **`pnpm build:api`** - Cross-compile KeyPears node for Linux only
- **`pnpm build:packages`** - Build TypeScript packages only (ts-lib +
  api-client)
- **`pnpm webapp:up`** - Test production build locally with Docker Compose
- **`pnpm webapp:down`** - Stop local Docker container
- **`pnpm webapp:logs`** - View local container logs

### Key Deployment Details

- **Platform**: linux/amd64 (required for Fargate, configured in
  docker-compose.yml)
- **Resources**: 0.5 vCPU, 1 GB memory (prevents OOM errors during deployment)
- **Dual-server setup**: Production container runs both servers via
  `ts-webapp/start.sh`:
  - KeyPears node (Rust): Port 4274, runs in background
  - Webapp server (Node.js): Port 4273, runs in foreground, proxies `/api/*`
    requests to KeyPears node
- **API proxy**: Webapp server uses `http-proxy-middleware` to forward all
  `/api/*` requests to the KeyPears node at `localhost:4274`, avoiding CORS
  issues
- **Cross-compilation**: KeyPears node is cross-compiled on macOS for Linux
  (x86_64-unknown-linux-musl) using musl-cross toolchain, then copied to
  `ts-webapp/bin/keypears-node` for Docker deployment
- **Canonical URL**: Express middleware redirects `http://keypears.com`,
  `http://www.keypears.com`, and `https://www.keypears.com` to
  `https://keypears.com` (301 permanent redirect)
- **Health checks**: Redirect logic allows ALB health checks to pass (only
  redirects specific production URLs)
- **Zero-downtime**: Deployment config (100% min, 400% max) allows fast rollouts
  without service interruption

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

### Markdown Content (Webapp Only)

All webapp markdown content is in `ts-webapp/markdown/`:

- **Blog posts**: `ts-webapp/markdown/blog/` as Markdown with TOML front-matter
  - **Filename**: `YYYY-MM-DD-slug.md`
  - **Front-matter**: TOML with `title`, `date`, `author`
    - `date` must be ISO 8601 with timezone: `"2025-10-25T06:00:00-05:00"` (6am Central Time)
  - **Content**: Never include title as H1 (auto-rendered from front-matter)
  - **Build**: `pnpm run build:blog` generates RSS, Atom, and JSON feeds
- **Static pages**: `about.md`, `privacy.md`, `terms.md` - loaded at runtime by
  their respective routes

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
