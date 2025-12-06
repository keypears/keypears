# Guide for AI Agents Working on KeyPears

> **Note**: `CLAUDE.md` is a symlink to this file (`AGENTS.md`). Only edit
> `AGENTS.md` - changes will automatically appear in `CLAUDE.md`.

## Overview

**Decentralized Password Manager**

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

Four main packages:

- **`@keypears/lib`** (TypeScript): Core TypeScript library (data structures,
  cryptography utilities)
- **`@keypears/api-server`** (TypeScript): KeyPears API server (backend API
  server) using orpc
- **`@keypears/tauri`** (Rust + TypeScript): Cross-platform native app (Mac,
  Windows, Linux, Android, iOS)
- **`@keypears/webapp`** (TypeScript): Landing page, blog, and production webapp
  with integrated API server

All TypeScript projects are managed with `pnpm` in a monorepo workspace
(`pnpm-workspace.yaml`). All Rust projects are managed with `cargo` in a
workspace (`Cargo.toml` at root).

### Folder Layout

```
lib/                - @keypears/lib source (TypeScript)
api-server/               - @keypears/api-server source (TypeScript API server using orpc)
tauri-rs/           - @keypears/tauri source (Rust backend)
tauri-ts/           - @keypears/tauri source (TypeScript frontend)
  └── src-tauri/    - Symlink to ../tauri-rs (for Tauri CLI compatibility)
webapp/             - @keypears/webapp source (TypeScript)
  └── start.sh      - Production startup script (runs webapp with integrated API)
docs/               - Documentation
whitepaper/         - Technical whitepaper (Typst format)
  └── keypears.typ  - Main whitepaper document
scripts/            - Build and deployment scripts
Cargo.toml          - Rust workspace configuration
Dockerfile          - Production Docker build (multi-stage, monorepo-aware, linux/amd64)
docker-compose.yml  - Docker Compose config (platform: linux/amd64 for Apple Silicon)
package.json        - Root-level pnpm scripts (build, webapp, deployment)
pnpm-workspace.yaml - TypeScript monorepo workspace configuration
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

### Tauri Development

When running the Tauri app (`pnpm tauri:dev` from `tauri-ts/`), Vite is
configured to pre-optimize all dependencies upfront to avoid stale cache issues:

```typescript
// tauri-ts/vite.config.ts
optimizeDeps: {
  entries: ['app/**/*.tsx', 'app/**/*.ts'], // Scan all app code upfront
  force: true, // Always rebuild optimization cache on server start
}
```

This ensures all route dependencies are optimized before the app loads,
preventing 504 errors during navigation.

### Rust Projects

**Note**: Rust code in KeyPears is minimal (only Tauri shell). Most development
is TypeScript. These commands are for the rare cases when modifying the Tauri
backend.

**For all Rust projects**, run these commands in order from the root directory:

1. `cargo fmt --all` - Format code with rustfmt
2. `cargo clippy --all-targets --all-features` - Lint with Clippy
3. `cargo test --all` - Run all tests
4. `cargo build --all` - Build all workspace members

All commands must pass before committing. Run for **every** Rust project
modified.

**Running integration tests** (tests marked with `#[ignore]`):

- `cargo test --package <package-name> -- -- --ignored` - Run only ignored tests
- `cargo test --package <package-name> -- -- --include-ignored` - Run all tests
  (unit + integration)

Note the double `--`: the first separates cargo arguments from test binary
arguments, the second separates test name filters from test harness flags.
Integration tests require external dependencies (e.g., a running server) and are
ignored by default to keep CI/CD fast and reliable.

### Building for Production

The TypeScript packages must be built before deployment:

1. **Build TypeScript packages**: `pnpm run build:packages` (builds lib and
   api-server)
2. **Build webapp**: Built automatically during Docker image creation
3. **Build all**: `pnpm run build:all` (builds TypeScript packages + Docker
   image)

The deployment pipeline is fully TypeScript-based with no Rust cross-compilation
needed.

## Programming Languages

- **TypeScript**: Frontend, API server, and webapp (runtime: Node.js)
- **Rust**: Tauri native app backend only

### Backend Architecture

The backend is built entirely in TypeScript using orpc for type-safe RPC:

- **`@keypears/api-server`**: TypeScript API server using orpc for end-to-end
  type safety. Exports both the router (for server-side integration) and client
  factory (for client-side usage).
- **orpc**: Modern TypeScript RPC framework with full type safety, similar to
  tRPC but with better OpenAPI integration
- **Current status**: Proof-of-concept complete with Blake3 hashing endpoint
  (`/api/blake3`)
- **Future work**: All backend vault operations and sync protocol will be
  implemented in TypeScript and exposed via orpc procedures
- **Branding**: The API server is called a "KeyPears API server" to emphasize
  the decentralized, network-oriented architecture similar to cryptocurrency
  nodes

### Essential TypeScript Patterns

- **Formatting**: `prettier`
- **Linting**: `eslint`
- **Type checking**: `typescript`
- **Testing**: `vitest`
- **Type safety**: NEVER use the `any` type under any circumstances.
  - ALWAYS find a way to explicitly specify types
  - NEVER use the `any` keyword
  - NEVER use `any` because you were too lazy to figure out what types to use
  - NEVER EVER EVER use `any` EVER under ANY circumstances. NEVER USE `any`
    EVER!!!!
- **API client**: `@keypears/api-server` exports `createClient()` for type-safe
  orpc client
- **Validation**: `zod` (for parsing and validation)
- **RPC framework**: `orpc` (`@orpc/server` and `@orpc/client`) for end-to-end
  type safety
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

- **Serialization**: `serde` with `#[derive(Serialize, Deserialize)]`
- **Testing**: Built-in `#[cfg(test)]` modules with `#[test]` functions
- **Error handling**: Never use `unwrap()` without proper error handling; prefer
  `?` operator and `Result<T, E>`
- **Safety**: Never use `unsafe` code
- **Code quality**: Always run `cargo fmt` and `cargo clippy` before committing
- **Cryptography**: Never implement crypto in Rust. Use `@keypears/lib`
  (TypeScript) which wraps WASM-compiled cryptography (`@webbuf/*` packages).
- **Note**: Rust is only used for tauri-rs (Tauri backend). All cryptography is
  in TypeScript. The API server is now TypeScript-based.

**Architecture Note**: KeyPears uses a TypeScript-first architecture. The Rust
codebase is minimal (~33 lines for Tauri shell only). All cryptography, API
logic, and business logic is in TypeScript. See the blog post "TypeScript for
the KeyPears MVP" for the reasoning behind this decision.

## Design Patterns

KeyPears has comprehensive design pattern documentation:

- **[UI/UX Patterns](docs/uiux.md)**: Visual design system, colors (Catppuccin),
  typography, component patterns (shadcn, buttons, inputs, forms), layout
  patterns, keyboard accessibility, interactions
- **[Code Patterns](docs/code.md)**: File structure, naming conventions, import
  ordering, component structure, state management with React Router, multi-step
  wizards
- **[Data Patterns](docs/data.md)**: Validation (Zod), database (ULID primary
  keys, Drizzle ORM), performance (debouncing, optimistic updates), error
  handling
- **[Cryptography Patterns](docs/crypto.md)**: Three-tier key derivation system,
  algorithms (Blake3, ACB3, AES-256), password policy, cross-platform WASM
  crypto stack
- **[Audit Guide](docs/audit.md)**: Codebase audit checklist, security
  assessment, lessons learned from past audits

## Business Strategy

KeyPears has comprehensive business strategy documentation:

- **[Business Plan](docs/business.md)**: Market opportunity, target audiences,
  business model (freemium with $99/year premium tier), revenue projections,
  growth strategy, marketing, and fundraising
- **[MVP Requirements](docs/mvp.md)**: Complete MVP specifications organized by
  phase with success criteria

## Deployment

- **[Deployment Guide](docs/deployment.md)**: Complete AWS Fargate deployment
  guide with Docker containerization, ECR, ECS, ALB, Route 53, and SSL

### Deployment Commands

- **`pnpm deploy:all`** - Full deployment: build TypeScript packages → build
  Docker image (linux/amd64) → push to ECR → redeploy on ECS Fargate
- **`pnpm deploy:build`** - Build and push to ECR only (no redeployment)
- **`pnpm deploy:update`** - Force ECS redeployment without rebuilding
- **`pnpm build:all`** - Build everything: TypeScript packages + Docker image
- **`pnpm build:packages`** - Build TypeScript packages only (lib + api-server)
- **`pnpm webapp:up`** - Test production build locally with Docker Compose
- **`pnpm webapp:down`** - Stop local Docker container
- **`pnpm webapp:logs`** - View local container logs

### Database Commands (Development)

- **`pnpm db:up`** - Start Postgres 17.5 database in Docker
- **`pnpm db:down`** - Stop Postgres database
- **`pnpm db:reset`** - Reset database (deletes Docker volume and all data)

The development database runs on `localhost:5432` with credentials
`keypears/keypears_dev` and database name `keypears_main`.

### Database Schema Management

**Philosophy**: KeyPears uses `drizzle-kit push` instead of traditional
migrations. This is appropriate for pre-MVP development where we frequently wipe
databases and don't need migration history. Post-launch, this workflow will be
refined for production data safety.

**Schema location**: All database schemas are defined in
`api-server/src/db/schema.ts`. The webapp references this schema via
`node_modules/@keypears/api-server/src/db/schema.ts`.

**Development workflow** (from `webapp/` directory):

1. Update schema in `api-server/src/db/schema.ts`
2. Build api-server: `pnpm --filter @keypears/api-server build` (from root)
3. Clear database: `pnpm db:dev:clear` (pushes empty schema, wipes all data)
4. Push schema: `pnpm db:dev:push` (pushes full schema to empty database)

**Staging workflow** (from `webapp/` directory):

1. Ensure `.env.staging` has correct `DATABASE_URL`
2. Clear staging: `pnpm db:staging:clear`
3. Push schema: `pnpm db:staging:push`
4. Verify staging database looks correct

**Production workflow** (PlanetScale):

1. Push schema to staging (see above)
2. Verify staging database is correct
3. In PlanetScale dashboard, create a "pull request" from staging to production
4. Review schema changes (NOT data changes) in the pull request
5. If changes look correct, accept the pull request
6. PlanetScale automatically updates production database schema

**Important notes**:

- **Always use webapp scripts**: Run all `db:*` commands from `webapp/`
  directory or via root `package.json`. Never run drizzle-kit directly from
  `api-server/`.
- **Clear vs Push**: `db:dev:clear` wipes data by pushing an empty schema.
  `db:dev:push` applies the full schema. Always run clear before push when
  changing schema structure.
- **No migrations**: We do NOT use `drizzle-kit generate` or migration files.
  All schema changes are applied via push, which is destructive but acceptable
  pre-launch.
- **Post-launch**: After MVP launch with real user data, this workflow will be
  refined to use proper migrations and safer schema evolution strategies.

### Key Deployment Details

- **Platform**: linux/amd64 (required for Fargate, configured in
  docker-compose.yml)
- **Resources**: 0.5 vCPU, 1 GB memory (prevents OOM errors during deployment)
- **Integrated API**: Production webapp has integrated orpc API server - single
  Express server handles both webapp routes and `/api/*` endpoints via
  `RPCHandler`
- **Port**: Webapp runs on port 4273 with integrated API
- **orpc Integration**: Webapp imports router from `@keypears/api-server` and
  mounts it at `/api` using `RPCHandler` from `@orpc/server/node`
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
- **Password policy**: Minimum 8 characters, default lowercase-only for mobile
  usability (~75 bits entropy)

See [`docs/crypto.md`](docs/crypto.md) for complete details.

### Database

- **Clients**: SQLite with Drizzle ORM
- **Servers**: PostgreSQL with Drizzle ORM
- **Primary keys**: ULID (time-ordered, collision-resistant)
- **Important**: Tauri SQLite doesn't support `.returning()` - always insert
  then fetch

See [`docs/data.md`](docs/data.md) for model patterns.

### Style & UI

- **Theme**: Catppuccin (Latte for light mode, Mocha for dark mode)
- **Primary color**: Green
- **Components**: Always use shadcn components
- **Icons**: Always use lucide-react (never inline SVG)
- **Layout**: Mobile-first, single-column design

See [`docs/uiux.md`](docs/uiux.md) for complete UI patterns.

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

All webapp markdown content is in `webapp/markdown/`:

- **Blog posts**: `webapp/markdown/blog/` as Markdown with TOML front-matter
  - **Filename**: `YYYY-MM-DD-slug.md`
  - **Front-matter**: TOML with `title`, `date`, `author`
    - `date` must be ISO 8601 with timezone: `"2025-10-25T06:00:00-05:00"` (6am
      Central Time)
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
