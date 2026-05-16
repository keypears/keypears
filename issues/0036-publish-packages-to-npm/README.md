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

## Experiment 1: build npm-ready packages

### Hypothesis

`@keypears/client` and `@keypears/pow5` can be prepared for npm publishing
together by producing ESM JavaScript and `.d.ts` outputs, tightening package
metadata, and validating the packed tarballs against the same import patterns
used by KeyPears.

### Decisions

- Publish both public packages together: `@keypears/client` and `@keypears/pow5`.
- Keep both public packages on the same version number before publishing.
- Use the entrypoint shape KeyPears already uses. The webapp imports both
  packages from their package roots:
  - `@keypears/client`: `contract`, `createKeypearsClientFromUrl`,
    `buildCanonicalPayload`, `hexBytes`, `hexMaxBytes`, and `addressSchema`.
  - `@keypears/pow5`: `Pow5_64b_Wasm`, `hashMeetsTarget`,
    `difficultyFromTarget`, and browser/client mining exports loaded through
    the root package import.
- Publish the files required by those KeyPears import paths and their runtime
  dependency closure. For `@keypears/pow5`, that includes the built JavaScript,
  declaration files, inline WASM support files, and WGSL files actually needed
  by the root exports.
- Do not add release automation beyond package scripts and documentation. The
  final process should document the exact pnpm/npm commands to build, bump
  versions, pack-check, and publish.

### Plan

1. Audit the public exports used by the webapp and benchmark packages.
2. Add or update TypeScript build configuration for `@keypears/client` so it
   emits ESM JavaScript and `.d.ts` files into `dist/`.
3. Update `@keypears/client` package metadata:
   - `main` points at built JavaScript;
   - `types` points at built declarations;
   - `exports` exposes the package root;
   - `files` limits published contents to runtime artifacts and metadata;
   - scripts include `clean`, `build`, `typecheck`, and `prepublishOnly`.
4. Audit `@keypears/pow5` packed output and update metadata as needed so npm
   consumers receive only the required built files and runtime assets.
5. Align the two public package versions to the same value.
6. Add publish documentation to the issue or package docs covering:
   - version bump command(s);
   - build command(s);
   - pack inspection command(s);
   - final publish command(s), including public access for scoped packages.
7. Verify both packages directly:
   - typecheck;
   - build;
   - package tarball contents via `pnpm pack` or `npm pack --dry-run`.
8. Validate from packed tarballs in a clean temporary consumer project:
   - import the `@keypears/client` root exports used by KeyPears;
   - import the `@keypears/pow5` root exports used by KeyPears;
   - run a small Node ESM script against non-browser exports;
   - run a browser/Vite smoke test if needed for WebGPU/WGSL-facing exports.
9. Record the resulting package contents and exact release commands.

### Acceptance Criteria

- `@keypears/client` publishes built JavaScript and `.d.ts` files instead of
  TypeScript source entrypoints.
- `@keypears/pow5` publishes built JavaScript, `.d.ts` files, and the runtime
  assets required by KeyPears imports.
- Both public packages have matching version numbers.
- Both package manifests have correct `main`, `types`, `exports`, `files`,
  license, and publish settings.
- `pnpm --filter @keypears/client run build` succeeds.
- `pnpm --filter @keypears/pow5 run build` succeeds.
- Tarball inspection confirms no benchmark, test, source-only, or generated
  local development clutter is included unintentionally.
- A clean temporary consumer can install the packed tarballs and import the
  same root exports KeyPears uses.
- The issue records exact manual commands for future version bumps and npm
  publish runs.

### Result

Pending.
