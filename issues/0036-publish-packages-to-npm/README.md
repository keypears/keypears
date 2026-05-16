+++
status = "closed"
opened = "2026-05-16"
closed = "2026-05-16"
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

## Experiment 1: build and publish npm packages

### Hypothesis

`@keypears/client` and `@keypears/pow5` can be built, validated, and published
to npm together by producing ESM JavaScript and `.d.ts` outputs, tightening
package metadata, validating the packed tarballs against the same import
patterns used by KeyPears, and then running the real npm publish. This
experiment is not complete until both packages are live on npm.

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
   - final publish command(s), including public access for scoped packages;
   - post-publish verification command(s).
7. Verify both packages directly:
   - typecheck;
   - build;
   - package tarball contents via `pnpm pack` or `npm pack --dry-run`.
8. Validate from packed tarballs in a clean temporary consumer project:
   - import the `@keypears/client` root exports used by KeyPears;
   - import the `@keypears/pow5` root exports used by KeyPears;
   - run a small Node ESM script against non-browser exports;
   - run a browser/Vite smoke test if needed for WebGPU/WGSL-facing exports.
9. Publish both packages to npm with the same version.
10. Verify the live npm packages:
   - npm registry pages show the published versions;
   - `npm view` returns the expected metadata;
   - a clean temporary consumer can install from the registry, not just local
     tarballs, and import the same root exports KeyPears uses.
11. Record the resulting package contents, exact release commands, published
   version, npm package URLs, and post-publish verification.

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
- Both packages are published to npm under the same version.
- `npm view @keypears/client@<version>` returns the published metadata.
- `npm view @keypears/pow5@<version>` returns the published metadata.
- A clean temporary consumer can install both packages from the npm registry and
  import the same root exports KeyPears uses.
- The issue records exact manual commands for future version bumps and npm
  publish runs.
- The experiment result records the published version and npm package URLs.

### Result

Won't implement.

The first implementation attempt started to change relative TypeScript imports
to emitted `.js` specifiers. That approach is no longer the desired direction.
Modern TypeScript supports writing relative imports with `.ts` extensions in
source and rewriting those extensions to JavaScript extensions during emit via
`rewriteRelativeImportExtensions`. The package publishing work should use that
feature instead of requiring developers to write `.js` paths in TypeScript
source.

## Experiment 2: publish with TypeScript extension rewriting

### Hypothesis

`@keypears/client` and `@keypears/pow5` can be published to npm while keeping
source imports honest to source files: relative imports use `.ts` in TypeScript
source, and TypeScript rewrites those relative import extensions to `.js` in the
emitted package output.

### Background

TypeScript supports `allowImportingTsExtensions` for source files that import
other TypeScript files using `.ts`, `.mts`, or `.tsx` extensions. TypeScript 5.7
added `rewriteRelativeImportExtensions`, which rewrites relative `.ts`, `.tsx`,
`.mts`, and `.cts` import paths to their JavaScript equivalents in emitted
files.

Official references:

- https://www.typescriptlang.org/tsconfig/allowImportingTsExtensions.html
- https://www.typescriptlang.org/tsconfig/#rewriteRelativeImportExtensions
- https://devblogs.microsoft.com/typescript/announcing-typescript-5-7-beta/#path-rewriting-for-relative-paths

### Decisions

- Use `.ts` extensions in package source relative imports.
- Use `rewriteRelativeImportExtensions` in package build configs so emitted
  JavaScript imports point at `.js` files.
- Use the entrypoint shape KeyPears already uses: package-root imports for both
  public packages.
- Publish both public packages together: `@keypears/client` and `@keypears/pow5`.
- Keep both public packages on the same version number before publishing.
- Publish the files required by the KeyPears import paths and their runtime
  dependency closure.
- Do not add release automation beyond package scripts and documentation. The
  result should document the exact pnpm/npm commands to build, bump versions,
  pack-check, publish, and verify.

### Plan

1. Audit relative imports in `packages/client/src` and `packages/pow5-ts/src`.
2. Update package source imports to use explicit `.ts` extensions where they
   refer to TypeScript source files.
3. Add or update package build tsconfigs to enable:
   - `allowImportingTsExtensions`;
   - `rewriteRelativeImportExtensions`;
   - ESM JavaScript emit into `dist/`;
   - `.d.ts` declaration emit.
4. Preserve non-TypeScript runtime asset handling for `@keypears/pow5`,
   including WGSL and inline WASM files required by KeyPears imports.
5. Update package manifests for npm:
   - matching versions;
   - `main`, `types`, and `exports` pointing at built output;
   - `files` limiting packed contents to package runtime artifacts;
   - license, repository metadata, and public scoped-package publish settings;
   - scripts for `clean`, `build`, `typecheck`, and `prepublishOnly`.
6. Verify the emitted JavaScript uses `.js` relative import specifiers, while
   source files use `.ts` relative import specifiers.
7. Build, typecheck, and inspect tarballs for both packages.
8. Validate local packed tarballs in a clean temporary consumer project:
   - import the `@keypears/client` root exports used by KeyPears;
   - import the `@keypears/pow5` root exports used by KeyPears;
   - run a small Node ESM script against non-browser exports;
   - run a browser/Vite smoke test if needed for WebGPU/WGSL-facing exports.
9. Publish both packages to npm with the same version.
10. Verify the live npm packages:
   - npm registry pages show the published versions;
   - `npm view` returns the expected metadata;
   - a clean temporary consumer can install from the registry and import the
     same root exports KeyPears uses.
11. Record the resulting package contents, exact release commands, published
   version, npm package URLs, and post-publish verification.

### Acceptance Criteria

- Package source relative imports use `.ts` extensions for TypeScript files.
- Emitted package JavaScript uses `.js` relative import specifiers.
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
- Both packages are published to npm under the same version.
- `npm view @keypears/client@<version>` returns the published metadata.
- `npm view @keypears/pow5@<version>` returns the published metadata.
- A clean temporary consumer can install both packages from the npm registry and
  import the same root exports KeyPears uses.
- The issue records exact manual commands for future version bumps and npm
  publish runs.
- The experiment result records the published version and npm package URLs.

### Result

Success.

The packages were built, validated, and published to npm on May 16, 2026:

- `@keypears/client@1.0.0`
- `@keypears/pow5@1.0.0`

Implemented package changes:

- `@keypears/client` now builds to `dist/` with ESM JavaScript and `.d.ts`
  declarations.
- `@keypears/client` root exports no longer re-export the oRPC `contract`.
  The webapp server imports the contract from `@keypears/client/contract`.
- `@keypears/client` exposes a KeyPears-owned `KeypearsClient` interface so
  root package consumers do not need the oRPC contract type graph.
- `@keypears/pow5` now builds to `dist/` with ESM JavaScript, `.d.ts`
  declarations, WGSL files, generated WGSL string modules, and inline WASM
  support files.
- Both public packages are aligned at version `1.0.0`.
- Both package manifests point `main`, `types`, `exports`, and `files` at the
  built npm package output.
- The repo sets `auto-install-peers=false` for pnpm so optional peers like
  `@opentelemetry/api` are not auto-installed into the lockfile.

Validation completed:

```bash
pnpm --filter @keypears/client run typecheck
pnpm --filter @keypears/pow5 run typecheck
pnpm --filter @keypears/webapp run typecheck
pnpm --filter @keypears/client pack --pack-destination /private/tmp/keypears-pack3
pnpm --filter @keypears/pow5 pack --pack-destination /private/tmp/keypears-pack3
```

A clean temporary consumer installed the packed tarballs, typechecked with
`skipLibCheck=false`, and ran a Node ESM import smoke test for the root package
exports.

The publish commands used for this release were:

```bash
pnpm --filter @keypears/client publish --access public --no-git-checks
pnpm --filter @keypears/pow5 publish --access public --no-git-checks
npm view @keypears/client@1.0.0 version
npm view @keypears/pow5@1.0.0 version
```

## Conclusion

Issue 36 published the first standard npm releases for the public KeyPears
packages:

- `@keypears/client@1.0.0`
- `@keypears/pow5@1.0.0`

Both packages now build with pnpm/Node into npm-ready `dist/` output containing
ESM JavaScript and `.d.ts` declarations. Package source keeps explicit `.ts`
relative imports, and TypeScript rewrites those imports to `.js` in emitted
JavaScript via `rewriteRelativeImportExtensions`.

`@keypears/client` now exposes built root client/auth/schema helpers and a
server-only contract subpath at `@keypears/client/contract`. `@keypears/pow5`
publishes the built TypeScript wrapper output plus the WGSL and inline WASM
runtime files required by consumers. Both packages have npm metadata for
`main`, `types`, `exports`, `files`, license, repository, public access, and
matching `1.0.0` versions.

The packages were validated with package typechecks, webapp typecheck, tarball
inspection, and a clean temporary consumer install/typecheck/import smoke test
before publishing.
