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

## Experiment 1

Inventory Bun-specific usage across package metadata, lockfiles, docs, and
runtime code. Use the inventory to decide the smallest first migration step.
