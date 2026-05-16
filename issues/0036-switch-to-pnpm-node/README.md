+++
status = "open"
opened = "2026-05-16"
+++

# Switch from Bun to pnpm and Node

## Goal

Move KeyPears development, builds, tests, and package publishing from Bun-first
tooling to pnpm and Node.

## Background

The repo currently documents and uses Bun as both package manager and runtime.
That creates friction for npm package publishing and for standard JavaScript
package workflows where pnpm and Node are the expected baseline. The npm
packages should build and publish with JavaScript output and `.d.ts` types
without depending on Bun-specific behavior.

The migration should cover the workspace root, `webapp`, landing pages, and
publishable packages under `packages/`. It should also update documentation so
contributors and self-hosters have one clear toolchain.

## Requirements

- Use pnpm as the package manager for the workspace.
- Use Node as the runtime for package scripts unless a specific tool requires
  otherwise.
- Replace Bun-specific scripts and documentation with pnpm/Node equivalents.
- Preserve the local development topology for `keypears.test`,
  `keypears.passapples.test`, `passapples.test`, and `lockberries.test`.
- Keep package publishing compatible with npm conventions: built `.js` files
  and `.d.ts` declarations.
- Avoid changing unrelated application behavior during the migration.

## Experiment 1: migrate the workspace toolchain

### Hypothesis

KeyPears can move from Bun-first tooling to pnpm and Node in one coordinated
toolchain migration without changing application behavior.

### Current Bun surface

- Root scripts in `package.json` call `bun run` for dev servers and database
  tasks.
- `webapp/package.json` uses Bun for the blog build script, production start,
  database orchestration, and icon generation.
- `webapp/package.json` depends on `@types/bun`.
- `packages/crypto-bench` and `packages/whitepaper-bench` use `bun` and `bunx`
  in benchmark scripts and comments.
- Documentation in `README.md`, `webapp/src/docs/development.md`, and
  `webapp/src/docs/self-hosting.md` names Bun as the required runtime and shows
  Bun commands.
- `bun.lock` exists at the repo root and under `webapp/`.
- There is no committed `pnpm-workspace.yaml` or `pnpm-lock.yaml`.

### Plan

1. Add pnpm workspace configuration at the repo root.
2. Generate and commit a root `pnpm-lock.yaml`.
3. Replace root `bun run` scripts with pnpm equivalents.
4. Replace `webapp` Bun scripts with Node/pnpm equivalents:
   - run TypeScript helper scripts with a Node-compatible runner such as `tsx`;
   - start the built server with a small Node HTTP adapter around the built
     TanStack Start fetch handler;
   - remove `@types/bun` if no runtime code still needs it.
5. Update benchmark package scripts and inline usage comments to use pnpm/Node.
6. Remove committed Bun lockfiles after pnpm is authoritative.
7. Update docs so contributors and self-hosters install with pnpm, run with
   pnpm, and deploy on Node.
8. Verify dev, build, tests, lint, database scripts, and package builds with
   pnpm commands.

### Acceptance criteria

- `rg -n "\bbun\b|Bun|bunx|bun\.lock"` finds no Bun references except in
  historical notes or explicit migration context.
- `pnpm install --frozen-lockfile` succeeds from a clean checkout.
- `pnpm run dev` starts the same local topology:
  `keypears.test`, `keypears.passapples.test`, `passapples.test`, and
  `lockberries.test`.
- `pnpm --filter @keypears/webapp build` succeeds.
- `pnpm --filter @keypears/webapp test` succeeds.
- `pnpm --filter @keypears/webapp lint` succeeds.
- `pnpm --filter @keypears/pow5 build` succeeds.
- The publishable packages can build npm-ready JavaScript and `.d.ts` output
  without Bun.
- Documentation examples use pnpm/Node consistently.

### Result

Pass for the toolchain migration; npm package output remains a separate follow-up
concern.

Changes made:

- Added `pnpm-workspace.yaml` and generated a root `pnpm-lock.yaml`.
- Removed the root and `webapp/` Bun lockfiles.
- Switched root, webapp, benchmark, and documentation commands from Bun to
  pnpm/Node.
- Replaced `@types/bun` / `bun-types` with Node types.
- Replaced the webapp's `Bun.file` static-file serving with Node filesystem
  reads and explicit content types for static assets.
- Added `webapp/start-node.js`, a Node HTTP adapter that serves the built
  TanStack Start fetch handler.
- Updated the production Dockerfile from Bun images and commands to Node images
  and pnpm commands.
- Updated current documentation and generated blog feeds to name pnpm/Node.

Verification:

- `pnpm install --frozen-lockfile` — pass.
- `pnpm run dev` — pass; all four dev servers reached ready state on ports
  3500, 3512, 3510, and 3520 before manual interrupt.
- `pnpm --filter @keypears/webapp run build` — pass.
- `pnpm --filter @keypears/webapp run test` — pass, 13 tests.
- `pnpm --filter @keypears/webapp run lint` — pass with 5 pre-existing
  warnings.
- `pnpm --filter @keypears/webapp run typecheck` — pass.
- `pnpm --filter @keypears/pow5 run build` — pass.
- `pnpm --filter @keypears/crypto-bench run bench:node` — pass.
- `pnpm --filter @keypears/whitepaper-bench run calc -- 4500000 1200000` —
  pass.
- `PORT=3599 pnpm --filter @keypears/webapp run start` plus
  `curl -fsS http://127.0.0.1:3599/health` — pass; the test server was then
  stopped.
- Static asset smoke test returned `content-type: text/css; charset=utf-8` for
  a built CSS asset.

Notes:

- `pnpm install` reports pnpm's build-script approval warning for packages such
  as `esbuild`, `sharp`, `msw`, and Playwright. The verified build, tests, and
  runtime smoke test still pass.
- Historical issue notes and one historical blog post still mention Bun or
  `bun.lock` as part of past work. Active package metadata, current docs,
  runtime code, and deployment config are migrated.
- Building npm-ready JavaScript and `.d.ts` artifacts for publishable packages
  is intentionally left out of this experiment so the runtime/package-manager
  migration stays separate from package publishing cleanup.
