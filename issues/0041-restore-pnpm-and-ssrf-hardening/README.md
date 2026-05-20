+++
status = "open"
opened = "2026-05-20"
+++

# Issue 41: Restore pnpm/Node and SSRF Hardening

## Goal

Restore the good work that was reverted during the production PoW rollback:

- migrate the repo from Bun-first tooling back to pnpm/Node
- restore server-side federation SSRF hardening

Do this without reintroducing the production PoW regression that was fixed in
issue 40.

## Background

During the production login incident, recent code/config changes were rolled
back aggressively to return the app to a known-good state. That was the right
debugging move at the time, but the rollback also removed unrelated work that
should still happen:

- issue 35 moved the workspace toward pnpm/Node so npm package publishing and
  standard JavaScript package workflows work cleanly
- issue 39 hardened federation fetches against SSRF, including the unprotected
  second hop from `keypears.json` `apiDomain` to the remote oRPC API

Issue 40 later showed that the production login problem was not caused by those
changes. The root cause was a latest-Chromium WebGPU behavior change in the
`pow5-64b` WGSL BLAKE3 path. That issue is fixed, production login works again,
and the package browser tests now reproduce the latest-Chromium path locally.

We should restore the reverted pnpm/Node and SSRF work deliberately, with the
new PoW regression tests in place so we do not repeat the production debugging
loop.

## Prior Work

### Issue 35: pnpm/Node Migration

Issue 35 established the desired toolchain direction:

- pnpm as the workspace package manager
- Node as the runtime for package scripts unless a tool specifically requires
  something else
- committed `pnpm-workspace.yaml` and `pnpm-lock.yaml`
- removal of committed Bun lockfiles
- script and documentation updates away from `bun`/`bunx`
- npm-compatible package builds that emit JavaScript and `.d.ts` files

This should be restored in a way that keeps current app behavior intact.

### Issue 39: Federation SSRF Hardening

Issue 39 established the desired federation security direction:

- all server-side federation HTTP requests go through one hardened path
- discovery and remote oRPC calls receive the same SSRF protections
- federation authorities are validated as hostnames or approved
  hostname-plus-port authorities, not arbitrary URLs
- private, loopback, link-local, multicast, documentation, unspecified,
  reserved, and otherwise non-public IP ranges are blocked for IPv4 and IPv6
- both A and AAAA records are checked
- DNS rebinding is avoided by using a vetted/pinned connection strategy or an
  equivalent guarantee
- redirects are blocked
- timeouts and response-size limits are preserved
- local development still works

This should be restored in a simple, maintainable form that matches the final
decisions made before the rollback.

## Requirements

- Keep production login PoW working.
- Keep latest-Chromium `pow5-64b` browser tests passing.
- Restore pnpm/Node workspace tooling and docs.
- Restore npm-compatible package build/publish behavior.
- Restore federation SSRF hardening for both discovery and remote oRPC calls.
- Preserve local development topology:
  - `keypears.test`
  - `keypears.passapples.test`
  - `passapples.test`
  - `lockberries.test`
- Keep the SSRF model simple:
  - require HTTPS
  - require real domain authorities
  - reject localhost/private IP targets
  - do not rely on broad environment-gated security exceptions
- Preserve federation behavior for legitimate public domains.
- Add or restore tests for dangerous federation inputs and DNS/IP edge cases.
- Update docs when package manager, runtime, commands, or self-hosting behavior
  changes.

## Verification

Every experiment that changes code should run the relevant subset of:

```bash
bun run --cwd packages/pow5-ts test
bun run --cwd packages/pow5-ts typecheck
bun run --cwd webapp typecheck
bun run --cwd webapp test
bun run --cwd webapp build
```

After pnpm is restored as authoritative, update the verification commands to
their pnpm equivalents and run those instead.

For SSRF work, also run the server-side federation tests that cover blocked
authorities, blocked DNS answers, redirects, response-size limits, and allowed
public-domain federation.

## Non-Goals

- Do not reopen the issue 40 PoW investigation unless the regression returns.
- Do not change PoW outputs, expected vectors, difficulty, or verification.
- Do not weaken federation SSRF protection to make implementation easier.
- Do not introduce unrelated refactors while restoring reverted work.
- Do not modify closed issues 35, 39, or 40.

## Experiment 1: Restore pnpm/Node Tooling

### Hypothesis

The workspace can be moved back from Bun-first tooling to pnpm/Node without
changing application behavior and without regressing the latest-Chromium PoW
fix from issue 40.

This should be done before SSRF restoration because package manager/runtime
changes affect every verification command and deployment path. Once pnpm is
authoritative again, the SSRF work can be restored and tested on the final
toolchain instead of being ported twice.

### Scope

This experiment restores only the pnpm/Node toolchain work. It does not restore
the federation SSRF hardening yet.

In scope:

- root workspace package manager configuration
- root and package scripts
- lockfile ownership
- docs that tell developers/self-hosters which commands to run
- package build/publish compatibility
- Docker/deploy build commands if they still depend on Bun
- verification commands rewritten to pnpm equivalents
- Nitro as the Node production server runtime

Out of scope:

- SSRF fetch hardening
- federation behavior changes
- PoW algorithm or expected output changes
- package version bumps unrelated to the toolchain
- `@keypears/pow5/wgsl` subpath restoration
- generated WGSL string modules such as `pow5-64b-wgsl-code.ts`
- `packages/pow5-ts/build-wgsl-modules.ts`
- intermediate custom Node bridge files such as `start-node.js`
- `.npmrc` unless package publishing verification proves it is required here

### Decisions

- Start from issue 35's known completed migration rather than redesigning the
  migration from scratch. Use the issue 35 close commit,
  `d1724b7f Close pnpm and Node migration issue`, as the source of truth for
  toolchain files, then adapt to the current tree and the issue 40 PoW fix.
- Publishable packages should use built `dist` output with `.d.ts` files. This
  preserves npm package behavior and means production builds must build
  workspace packages before building the webapp.
- The webapp production server runtime should be Nitro, matching the final issue
  35 state. Do not restore the intermediate custom Node HTTP bridge.
- The PoW package should keep the current `?raw` WGSL import path. Do not
  restore the generated WGSL string-module detour from the production PoW
  investigation.
- The latest-Chromium PoW browser tests are the hard abort gate. If
  `pnpm --filter @keypears/pow5 test` fails at any point, stop and fix that
  before proceeding. Do not commit or deploy a pnpm migration that breaks the
  issue 40 regression test.

### Plan

1. Restore the issue 35 toolchain baseline.

   Start by restoring known pnpm/Node files from `d1724b7f`, then adapt them to
   the current repository rather than hand-authoring the migration again.

   Likely restore targets include:

   ```bash
   git checkout d1724b7f -- \
     pnpm-workspace.yaml \
     package.json \
     webapp/package.json \
     webapp/Dockerfile \
     passapples/package.json \
     lockberries/package.json \
     packages/client/package.json \
     packages/client/tsconfig.build.json \
     packages/pow5-ts/package.json \
     packages/pow5-ts/tsconfig.build.json
   ```

   Then inspect every restored file against the current tree. Keep current issue
   40 PoW source/test fixes and do not restore reverted WGSL-generation detours.

2. Re-establish pnpm workspace ownership.

   Add or restore:

   - `pnpm-workspace.yaml`
   - root `pnpm-lock.yaml`
   - `packageManager` metadata for pnpm where appropriate

   Generate the lockfile before attempting frozen installs:

   ```bash
   pnpm install
   ```

   After that, frozen install must work:

   ```bash
   pnpm install --frozen-lockfile
   ```

   Remove committed Bun lockfiles after pnpm is authoritative:

   - root `bun.lock`
   - `webapp/bun.lock` if still present

3. Convert root scripts.

   Replace root `bun run ...` invocations with pnpm equivalents while preserving
   the existing local topology:

   - `keypears.test`
   - `keypears.passapples.test`
   - `passapples.test`
   - `lockberries.test`

4. Convert package scripts.

   Update `webapp`, landing pages, and publishable packages so scripts run under
   pnpm/Node. Use `tsx` or plain `node` for TypeScript helper scripts instead of
   relying on Bun execution.

   Audit and remove `@types/bun` if no source still needs Bun APIs. Add or keep
   `@types/node` where Node script/runtime types are needed. Prefer one shared
   workspace `tsx` dependency when possible instead of duplicating it across
   packages.

5. Preserve package publishing behavior.

   Ensure publishable packages still build npm-compatible artifacts:

   - JavaScript output
   - `.d.ts` types
   - copied WGSL/WASM assets where required
   - correct `exports`, `main`, and `types` fields

   The intended package model is `dist`-main for publishable packages, not
   source-TS main. Docker and production builds must account for that.

6. Update deployment and Docker paths.

   If Docker or deploy scripts still install or run with Bun, switch them to the
   pnpm/Node flow. The production build must still build workspace packages
   before the webapp build when needed.

   Pin the Docker build order:

   ```dockerfile
   RUN pnpm --filter @keypears/client --filter @keypears/pow5 run build
   RUN pnpm --filter @keypears/webapp run build
   ```

   The webapp runtime should use Nitro output:

   ```bash
   node .output/server/index.mjs
   ```

7. Update docs.

   Replace Bun commands and runtime references in contributor/self-hosting docs
   with pnpm/Node commands. Historical mentions inside issue documents can stay.

   Explicitly audit/update:

   - `README.md`
   - `AGENTS.md`
   - `CLAUDE.md`
   - `webapp/src/docs/development.md`
   - `webapp/src/docs/self-hosting.md`
   - `infra/README.md` if it exists or if infra docs mention Bun

8. Verify incrementally.

   After workspace and root script restoration:

   ```bash
   pnpm install
   pnpm install --frozen-lockfile
   pnpm --filter @keypears/pow5 test
   ```

   If the PoW test fails, stop immediately.

   After package script/build restoration:

   ```bash
   pnpm --filter @keypears/pow5 build
   pnpm --filter @keypears/pow5 typecheck
   pnpm --filter @keypears/client build
   pnpm --filter @keypears/client typecheck
   pnpm --filter @keypears/webapp typecheck
   pnpm --filter @keypears/webapp test
   ```

   After Docker/deploy restoration:

   ```bash
   pnpm --filter @keypears/webapp build
   ```

   Also build the Docker image locally if Docker is available. Confirm the image
   uses pnpm/Node/Nitro and not Bun.

9. Verify with pnpm.

   Required checks after migration:

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @keypears/pow5 test
   pnpm --filter @keypears/pow5 typecheck
   pnpm --filter @keypears/webapp typecheck
   pnpm --filter @keypears/webapp test
   pnpm --filter @keypears/webapp build
   ```

   Also run package builds for publishable packages:

   ```bash
   pnpm --filter @keypears/pow5 build
   pnpm --filter @keypears/client build
   ```

10. Audit for remaining Bun surface.

   Run:

   ```bash
   rg -n "\bbun\b|Bun|bunx|bun\.lock" \
     package.json pnpm-workspace.yaml README.md AGENTS.md CLAUDE.md infra \
     webapp packages passapples lockberries
   ```

   Any remaining matches must be either removed or explicitly justified as
   historical/non-runtime text.

   If Nitro is the runtime, also confirm no intermediate bridge file is restored:

   ```bash
   rg -n "start-node|Bun\\.serve|bun:" webapp infra package.json
   ```

### Expected Result

The repo should be pnpm/Node-first again. Developers should install, test,
build, and deploy with pnpm commands. Bun lockfiles and Bun runtime assumptions
should be gone from active tooling.

The app should behave the same as before the experiment, including working
production login PoW and passing latest-Chromium `pow5-64b` browser tests.

### Non-Goals

- Do not restore SSRF hardening in this experiment.
- Do not change federation behavior.
- Do not change PoW outputs or expected vectors.
- Do not update unrelated dependencies unless required by pnpm resolution.
- Do not modify closed issue documents.
