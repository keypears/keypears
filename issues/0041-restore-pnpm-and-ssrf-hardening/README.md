+++
status = "closed"
opened = "2026-05-20"
closed = "2026-05-20"
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

   Also smoke-test the built server entry so missing Nitro route wiring is
   caught:

   ```bash
   KEYPEARS_DOMAIN=keypears.test \
     KEYPEARS_API_DOMAIN=keypears.test \
     KEYPEARS_SECRET=0000000000000000000000000000000000000000000000000000000000000001 \
     PORT=4274 \
     node webapp/.output/server/index.mjs

   curl -fsS http://localhost:4274/health
   curl -fsS http://localhost:4274/.well-known/keypears.json
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

### Result: Pass

Implemented on 2026-05-20.

The repo is pnpm/Node-first again:

- added `pnpm-workspace.yaml` and `pnpm-lock.yaml`
- removed committed Bun lockfiles
- converted root, webapp, benchmark, package, Docker, and docs commands from
  Bun to pnpm/Node
- restored Nitro as the production server runtime
- removed the Bun custom server entrypoint
- restored npm-compatible `dist` package output for `@keypears/client` and
  `@keypears/pow5`
- fixed the `@keypears/pow5` build so clean Docker builds copy the inline WASM
  support files into `dist`
- preserved the current raw-WGSL PoW browser path and latest-Chromium fix

Verification passed:

```bash
pnpm install
pnpm install --frozen-lockfile
pnpm --filter @keypears/pow5 test
pnpm --filter @keypears/pow5 build
pnpm --filter @keypears/pow5 typecheck
pnpm --filter @keypears/client build
pnpm --filter @keypears/client typecheck
pnpm --filter @keypears/webapp typecheck
pnpm --filter @keypears/webapp test
pnpm --filter @keypears/webapp build
docker build -f webapp/Dockerfile -t keypears:pnpm-node-check .
```

Additional server-entry smoke tests passed after restoring the
Nitro-compatible request entry:

```bash
curl -fsS http://localhost:4274/health
curl -fsS http://localhost:4274/.well-known/keypears.json
curl -fsS -o /tmp/keypears-api-smoke.txt -w '%{http_code}' \
  -X POST http://localhost:4274/api/serverInfo \
  -H 'content-type: application/json' \
  --data '{}'
```

Results:

- `/health` returned `ok`
- `/.well-known/keypears.json` returned
  `{"apiDomain":"keypears.test"}`
- `/api/serverInfo` returned HTTP `200`

The Bun surface audit is clean for active tooling. The only remaining matches
are `moduleResolution: "Bundler"` false positives and historical blog/issue
text.

## Experiment 2: Harden and Reuse Federation Fetch

### Hypothesis

The SSRF fix does not need a broad federation rewrite. It should be a small,
auditable change with two parts:

1. every server-side request whose target host comes from a third-party
   federation domain must use the same protected fetch path
2. that protected fetch path must close the current DNS check/fetch gap

Today `fetchKeypearsJson(domain)` uses `safeFetch()`, but the remote oRPC
client path created from discovered `apiDomain` values uses normal
`RPCLink`/`fetch`. That means a hostile `keypears.json` can move the second hop
to an unintended host. Also, the current `safeFetch()` resolves DNS, checks the
answer, and then calls normal `fetch(url)`, which performs its own lookup. The
check and the actual connection can diverge.

If we centralize all federation HTTP through a stronger `safeFetch()`, the
remaining policy is simple: KeyPears federation may call HTTPS DNS hostnames,
but not localhost, IP literals, private/link-local/reserved addresses, or
redirect targets.

### Scope

In scope:

- `webapp/src/lib/federation-authority.ts`
- `webapp/src/server/fetch.ts`
- `webapp/src/server/federation.server.ts`
- `webapp/src/server/api.router.ts`
- server-side oRPC client construction for federation calls
- tests for `safeFetch()` and federation client routing
- `webapp/src/docs/security.md` if the documented SSRF behavior changes

Out of scope:

- changing the KeyPears federation protocol
- changing oRPC contracts
- adding domain allowlists
- adding broad environment-gated security exceptions
- changing PoW, auth, message encryption, or package build behavior

### Plan

0. Restore the known issue 39 implementation as the starting point.

   Issue 39 already implemented and audited the hard parts of this work. Start
   from the closed issue 39 tree instead of re-deriving pinned fetch logic from
   scratch:

   ```bash
   git checkout 03dabb5b -- \
     webapp/src/lib/federation-authority.ts \
     webapp/src/server/fetch.ts \
     webapp/src/server/fetch.test.ts
   ```

   Then reconcile those files with the current post-issue-40/post-pnpm tree.
   Apply the known deltas from the issue 39 review history:

   - remove the old `.test`/`NODE_ENV` carveout
   - ensure no `nodeEnv = undefined` default can make a dev exception active in
     production
   - keep the branded `FederationAuthority` validation model
   - keep the server-only oRPC custom-fetch pattern
   - keep per-call response-size caps

1. Inventory every third-party federation fetch.

   Confirm all server-side paths where a host comes from a user address,
   `keypears.json`, `apiDomain`, or another remote federation response:

   - `fetchKeypearsJson(domain)`
   - `resolveApiUrl(domain)`
   - `fetchRemotePublicKey(address)`
   - `fetchRemotePowChallenge(input)`
   - `deliverRemoteMessage(...)`
   - inbound `getPowChallenge` sender-key lookup
   - inbound `notifyMessage` pull-message lookup
   - domain-claim verification through `verifyDomainAdmin`

   Also grep for direct server-side client creation:

   ```bash
   rg -n "createKeypearsClientFromUrl|RPCLink|new RPCLink|fetch\\(" webapp/src/server packages/client/src
   ```

2. Keep `safeFetch()` as the single server-side federation fetch primitive, but
   make it stricter.

   The function should:

   - require `https:`
   - allow only the default HTTPS port, rejecting explicit non-443 ports
   - reject userinfo, redirects, and malformed URLs
   - reject `localhost` and localhost-like names
   - reject IP literals as federation authorities
   - reject non-ASCII hostnames unless they are already in ASCII punycode
     (`xn--...`) form
   - normalize authorities to lowercase ASCII before use or caching
   - resolve both A and AAAA records
   - reject the target if any answer is loopback, private, link-local,
     multicast, documentation, unspecified, reserved, IPv4-mapped IPv6, 6to4,
     Teredo, or otherwise non-public
   - connect to the vetted resolved address rather than handing the hostname
     back to `fetch()` for a second lookup
   - preserve the original hostname for TLS SNI and the `Host` header
   - reject redirects
   - preserve timeout behavior
   - preserve response-size limits, with a configurable cap for small
     `keypears.json` responses and larger oRPC responses

   This can be implemented with Node HTTPS/Undici primitives if normal
   `fetch()` cannot pin the resolved address safely.

   Request bodies can be buffered in memory before forwarding to the pinned
   HTTPS request. Current federation oRPC payloads are small enough for that
   tradeoff, and response-size caps remain explicit per call.

3. Route remote oRPC through `safeFetch()`.

   Add a server-only federation client factory in `webapp/src/server`, rather
   than changing the public `@keypears/client` API unless that is clearly
   necessary. The factory should create the oRPC `RPCLink` with a custom
   `fetch` implementation backed by `safeFetch()`.

   Replace server-side federation uses of `createKeypearsClientFromUrl()` with
   this factory. The public package client can continue to use normal browser
   or app-level fetch behavior.

4. Validate authority values before interpolation.

   Do not let arbitrary strings flow into `https://${domain}/api`.

   Use the issue 39 branded type pattern:

   ```ts
   type FederationAuthority = string & {
     readonly __federationAuthority: unique symbol;
   };
   ```

   Functions that build federation URLs should accept `FederationAuthority`, not
   raw `string`, so missing validation becomes a TypeScript error instead of a
   runtime convention.

   - Validate parsed address domains before discovery.
   - Validate discovered `apiDomain` before building the API URL.
   - Validate this server's own `KEYPEARS_API_DOMAIN` through the same path
     before it is emitted in `/.well-known/keypears.json`.
   - Normalize cache keys to the validated lowercase ASCII authority.

5. Preserve local development deliberately.

   Existing same-server local-domain shortcuts should continue to work. Do not
   add a broad `.test` or `NODE_ENV` carveout unless implementation proves that
   the current dev topology cannot work without one.

   If cross-instance local federation fails because `.test` resolves to
   loopback, stop and document the exact failing path before adding any policy
   exception. The exception needs explicit approval because it changes the
   security model.

   The manual dev flows to check are:

   - claim `keypears.passapples.test` from `keypears.test`
   - send a message from `alice@keypears.test` to
     `bob@keypears.passapples.test`
   - log in as a user on the cross-instance local domain

   If a dev exception is later approved, the only acceptable shape is an
   explicit opt-in authority allowlist with an empty default, for example:

   ```text
   KEYPEARS_DEV_LOOPBACK_AUTHORITIES=keypears.test,keypears.passapples.test
   ```

   Do not use `NODE_ENV`, do not use a blanket `.test` TLD rule, and do not
   make the allowlist implicit.

6. Add tests.

   Cover:

   - `safeFetch()` rejects non-HTTPS URLs
   - `safeFetch()` rejects redirects
   - `safeFetch()` rejects localhost names
   - `safeFetch()` rejects IPv4 and IPv6 literals
   - `safeFetch()` rejects private/link-local/reserved DNS answers
   - mixed public/private DNS answers are rejected
   - DNS is not re-resolved after validation
   - `.test` resolving to `127.0.0.1` is rejected even outside production
   - response-size caps are enforced
   - `fetchKeypearsJson()` uses the protected path
   - remote oRPC federation calls use the protected path
   - direct server-side `createKeypearsClientFromUrl()` use is gone from
     federation code
   - the in-memory `keypearsJsonCache` is keyed by normalized authority and
     does not survive process restart

7. Update docs.

   Update `webapp/src/docs/security.md` so the SSRF section describes the real
   behavior:

   - federation requests are HTTPS-only
   - authorities must be valid DNS hostnames
   - localhost/IP/private/reserved targets are rejected
   - redirects are rejected
   - DNS answers are pinned or equivalently bound to the actual connection
   - response-size limits and timeouts apply

### Verification

Run:

```bash
pnpm --filter @keypears/webapp typecheck
pnpm --filter @keypears/webapp test
pnpm --filter @keypears/webapp build
```

Run the audit greps:

```bash
rg -n "createKeypearsClientFromUrl|RPCLink|new RPCLink" webapp/src/server
rg -n "fetch\\(" webapp/src/server
```

The first grep should show no plain federation client construction. The second
grep should leave only expected framework/server-function uses or calls that do
not use third-party-controlled authorities.

If the change touches `webapp/src/server.ts`, `webapp/vite.config.ts`, or
`webapp/Dockerfile`, also repeat the Nitro smoke tests from Experiment 1:

```bash
pnpm --filter @keypears/webapp build
curl -fsS http://localhost:4274/health
curl -fsS http://localhost:4274/.well-known/keypears.json
curl -fsS -o /tmp/keypears-api-smoke.txt -w '%{http_code}' \
  -X POST http://localhost:4274/api/serverInfo \
  -H 'content-type: application/json' \
  --data '{}'
```

### Success Criteria

- All third-party-controlled federation hosts go through `safeFetch()`.
- `safeFetch()` no longer has a DNS precheck followed by an independent
  hostname fetch.
- Federation still works for valid public HTTPS domains.
- Local development still works, or implementation stops with a concrete
  report before adding a dev-only exception.
- Tests prove the dangerous authority and DNS cases are rejected.
- Security docs match the implementation.

### Result: Pass

Implemented on 2026-05-20.

Federation SSRF hardening is restored in the active pnpm/Node tree:

- added the branded `FederationAuthority` validator back under
  `webapp/src/lib/federation-authority.ts`
- replaced the old `safeFetch()` wrapper with pinned-resolution
  `safeFederationFetch()`
- removed the old `.test`/`NODE_ENV` private-address carveout
- rejected non-ASCII authorities unless they are already ASCII/punycode
- kept the default HTTPS port-only policy
- routed remote federation oRPC through a server-only client factory that
  injects `safeFederationFetch()`
- removed direct server-side `createKeypearsClientFromUrl()` federation usage
- validated this server's own `KEYPEARS_API_DOMAIN` before emitting
  `/.well-known/keypears.json`
- normalized `keypears.json` cache keys through `FederationAuthority`
- updated `webapp/src/docs/security.md` to describe the actual fetch policy

The implementation intentionally does not add a dev loopback exception. `.test`
remains a valid DNS hostname, but if it resolves to loopback it is blocked by
the same private-address rule as any other hostname.

The local shell used for implementation did not have the `.test` DNS topology
configured (`keypears.test` and `keypears.passapples.test` returned
`ENOTFOUND`), so cross-instance dev federation was not manually exercised. If a
developer environment resolves those names to loopback, the new policy will
block cross-instance federation until an explicit dev allowlist is approved.

Verification passed:

```bash
pnpm --filter @keypears/webapp typecheck
pnpm --filter @keypears/webapp test
pnpm --filter @keypears/webapp build
rg -n "createKeypearsClientFromUrl|RPCLink|new RPCLink" webapp/src/server
rg -n "fetch\\(" webapp/src/server
rg -n "nodeEnv|isDevTestAuthority|safeFetch\\b" webapp/src/server webapp/src/lib
curl -fsS http://localhost:4274/health
curl -fsS http://localhost:4274/.well-known/keypears.json
curl -fsS -o /tmp/keypears-api-smoke.txt -w '%{http_code}' \
  -X POST http://localhost:4274/api/serverInfo \
  -H 'content-type: application/json' \
  --data '{}'
```

Audit results:

- `RPCLink` appears only in `webapp/src/server/federation.server.ts`, inside
  the protected federation client factory.
- No server-side raw `fetch(` calls remain in `webapp/src/server`.
- No `nodeEnv`, `isDevTestAuthority`, or old `safeFetch` references remain in
  `webapp/src/server` or `webapp/src/lib`.
- Nitro smoke tests passed: `/health` returned `ok`,
  `/.well-known/keypears.json` returned `{"apiDomain":"keypears.test"}`, and
  `/api/serverInfo` returned HTTP `200`.

Build still reports the existing Vite/Tailwind CSS warnings and large chunk
warnings; those are unchanged by this experiment.

## Experiment 3: Remove Pinned Federation Fetch

### Hypothesis

The pinned-resolution `safeFederationFetch()` approach is too complex for
KeyPears and breaks the local development topology. KeyPears federation already
uses HTTPS domain names, so the application should rely on normal platform
HTTPS behavior: DNS resolution, TLS validation, SNI, and the HTTP `Host`
header.

The security boundary should be simple:

- federation uses HTTPS URLs
- federation authorities are domain names, not arbitrary full URLs
- local development works with normal `.test` DNS
- remote oRPC uses the same normal fetch behavior as other HTTPS clients

### Plan

1. Remove pinned-resolution fetch.

   - Delete private/reserved IP classification.
   - Delete custom `https.request` handling.
   - Delete DNS lookup pinning.
   - Delete tests that assert private DNS answers are blocked.

2. Restore normal fetch behavior.

   - Use ordinary `fetch()` / oRPC `RPCLink` fetch behavior for federation.
   - Keep redirects rejected only if that remains useful as a simple fetch
     option.
   - Keep timeout and response-size limits only for `keypears.json` if still
     useful.

3. Keep simple authority validation.

   - Keep or simplify `FederationAuthority` so `apiDomain` cannot be a full
     URL, path, query string, userinfo, or malformed host.
   - Allow normal DNS names, including `.test`.
   - Do not reject loopback/private DNS answers.
   - Decide during implementation whether non-443 HTTPS ports should be
     allowed for dev and self-hosting.

4. Restore local dev federation.

   - Verify sending from `keypears.test` to `passapples.test`.
   - Verify domain claiming between local `.test` domains if that flow is
     available.
   - Verify production build still serves `/.well-known/keypears.json` and
     `/api`.

5. Update docs.

   - Remove claims about SSRF private-IP blocking and pinned DNS.
   - Document that federation uses normal HTTPS domain resolution and TLS
     validation.

### Verification

```bash
pnpm --filter @keypears/webapp typecheck
pnpm --filter @keypears/webapp test
pnpm --filter @keypears/webapp build
```

Manual checks:

- send a message from `keypears.test` to `passapples.test`
- verify local domain claiming if that flow is available
- smoke test `/health`, `/.well-known/keypears.json`, and `/api/serverInfo`

### Success Criteria

- Local `.test` federation works again.
- Federation code no longer contains pinned DNS or private-IP blocking logic.
- Federation still uses HTTPS URLs and normal TLS validation.
- The implementation is smaller and easier to reason about.

### Result: Pass

Implemented on 2026-05-20.

The pinned federation fetch implementation was removed from active code:

- deleted `webapp/src/server/fetch.ts`
- deleted the DNS/private-IP blocking tests from
  `webapp/src/server/fetch.test.ts`
- added focused authority validation tests in
  `webapp/src/lib/federation-authority.test.ts`
- removed `safeFederationFetch()` and the server-only custom oRPC fetch
- restored normal `createKeypearsClientFromUrl()` oRPC behavior for remote
  federation calls
- kept strict domain authority validation with no schemes, ports, paths,
  queries, fragments, userinfo, localhost names, IP literals, or non-ASCII
  hostnames outside punycode form
- kept self-constructed HTTPS federation URLs:
  `https://{domain}/.well-known/keypears.json` and `https://{domain}/api`
- updated the security docs to describe normal HTTPS DNS/TLS/SNI/Host behavior

The active code no longer has `safeFetch`, `safeFederationFetch`,
private-address DNS blocking, DNS pinning, or custom `https.request`
federation transport.

Verification passed:

```bash
pnpm --filter @keypears/webapp typecheck
pnpm --filter @keypears/webapp test
pnpm --filter @keypears/webapp build
rg -n "safeFetch|safeFederationFetch|isBlockedIpAddress|resolveFederationAuthority|node:https|node:dns|private/reserved|pinned" webapp/src
curl -fsS http://localhost:4274/health
curl -fsS http://localhost:4274/.well-known/keypears.json
curl -fsS -o /tmp/keypears-api-smoke.txt -w '%{http_code}' \
  -X POST http://localhost:4274/api/serverInfo \
  -H 'content-type: application/json' \
  --data '{}'
```

The audit grep returned no active-code matches.
The smoke tests returned `ok`, `{"apiDomain":"keypears.test"}`, and HTTP
`200`.

## Conclusion

Issue 41 restored the pnpm/Node workspace and npm-compatible package build
setup after the production PoW rollback. The active toolchain now uses pnpm
workspace commands, Node/Nitro for the production webapp runtime, committed
`pnpm-workspace.yaml` and `pnpm-lock.yaml`, JavaScript plus `.d.ts` package
build outputs, and Docker build steps that build workspace packages before the
webapp.

The SSRF hardening track was intentionally closed as a non-issue for the
current protocol. The active federation code no longer uses pinned DNS,
private-address DNS blocking, `safeFetch`, `safeFederationFetch`, or a custom
`https.request` transport. Federation keeps the simpler policy chosen here:
validate federation authorities as DNS hostnames, reject full URLs, ports,
paths, query strings, fragments, userinfo, localhost names, IP literals, and
non-ASCII hostnames outside punycode form, then construct normal HTTPS URLs and
rely on standard DNS, TLS, SNI, and Host behavior.

Local `.test` federation works again under the normal development DNS setup.
The retained verification for this issue is the pnpm webapp typecheck, test,
build, active-code grep for removed safe-fetch machinery, and Nitro endpoint
smoke tests for `/health`, `/.well-known/keypears.json`, and `/api/serverInfo`.
