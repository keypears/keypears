+++
status = "open"
opened = "2026-05-16"
+++

# Publish Packages to npm

## Goal

Prepare and publish the public KeyPears packages to npm with standard package
artifacts: JavaScript files, `.d.ts` TypeScript declarations, correct package
metadata, and reproducible pnpm/Node release commands.

## Background

Issue 35 moved the repo from Bun-first tooling to pnpm and Node. That made the
workspace easier to build with standard npm tooling, but it intentionally left
the actual npm package output work for a separate issue.

The immediate publishing targets are the public packages under `packages/`:

- `@keypears/client`
- `@keypears/pow5`

The benchmark packages are currently marked `private: true` and should remain
out of npm publishing unless this issue discovers a concrete reason to change
that.

Today, the publishable package metadata is not uniformly npm-ready.
`@keypears/client` points `main` and `types` at TypeScript source files instead
of built JavaScript and declaration files. `@keypears/pow5` has a build pipeline
for TypeScript, inline WASM, and WGSL assets, but its package metadata and
packed output still need to be audited against what npm consumers should
receive.

## Requirements

- Publish only packages intended for public npm use.
- Produce built JavaScript files and `.d.ts` declarations for every published
  package.
- Use pnpm/Node commands only; do not reintroduce Bun-specific release steps.
- Keep package exports compatible with ESM consumers.
- Include all runtime assets required by consumers, including `@keypears/pow5`
  WASM/WGSL-derived files.
- Exclude source-only, test-only, benchmark-only, and local development files
  from packed npm tarballs unless they are intentionally part of the public API.
- Ensure package metadata is correct: `main`, `types`, `exports`, `files`,
  `license`, repository metadata, versioning, and publish access.
- Verify package contents with `pnpm pack` or `npm pack --dry-run` before any
  real publish.
- Validate packages from the packed tarballs in a clean temporary consumer
  project before publishing.
- Document the release commands and any npm authentication prerequisites.

## Open Questions

- Should the first npm release publish both `@keypears/client` and
  `@keypears/pow5`, or should they ship one at a time?
- Should package versions stay at their current values or be reset/bumped before
  the first real npm publish?
- Does `@keypears/client` need separate browser and Node entrypoints, or is one
  ESM build sufficient?
- What exact files from the `@keypears/pow5` build are required at runtime by
  browser consumers?
- Should publish automation live as package-level scripts only, or should there
  be a root release script that verifies all public packages together?
