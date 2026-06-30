# Experiment 2: Playwright Account Lifecycle Harness

## Description

Add the first KeyPears Playwright end-to-end test harness and prove it with a
repeatable account lifecycle smoke test over local HTTPS.

This experiment should establish the project structure, scripts, environment
handling, and real WebGPU proof-of-work strategy that later experiments will
reuse for messaging, vault, password changes, domain administration, and
cross-domain federation.

## Changes

- Add Playwright as a webapp test dependency and add webapp scripts for:
  - running the E2E suite;
  - starting the primary KeyPears E2E dev server;
  - creating, clearing, and pushing the primary E2E database.
- Add a Playwright config under `webapp/` that targets `https://keypears.test`,
  collects traces/screenshots/videos on failure, and uses the local Caddy HTTPS
  route rather than raw localhost as the browser base URL.
- Set `ignoreHTTPSErrors: true` in the Playwright config because the local
  domains are served by Caddy's `tls internal` CA. This keeps the tests focused
  on KeyPears behavior while still requiring traffic to go through the HTTPS
  Caddy route.
- Add a plaintext local E2E env file for the primary server using non-production
  test secrets and a dedicated `keypears_e2e` database. This database must be
  distinct from the dev database and from `.env.test`'s `keypears_test`
  database.
- Configure Playwright `webServer` to own the E2E server lifecycle:
  - start the primary KeyPears dev server on port `3500` using the E2E env file;
  - wait on `https://keypears.test`;
  - set `reuseExistingServer: false` so a stray `bun run dev` cannot silently
    serve the wrong database.
- Keep the E2E server script aligned with `dev:keypears` by setting
  `NODE_TLS_REJECT_UNAUTHORIZED=0`. Single-domain account lifecycle does not
  need outbound federation, but this keeps later HTTPS local-domain work from
  inheriting a divergent server environment.
- Add a non-production-only proof-of-work difficulty override for E2E/dev tests
  so the existing browser miner solves real WebGPU challenges quickly. The
  override must only lower challenge difficulty when explicitly enabled outside
  production, must not lower the production constants or production-enforced
  minimums, and must not add a test-only PoW bypass or fake solution path.
- Wire the difficulty override at challenge issuance only. When the E2E gate is
  absent, challenge creation must use the unchanged production constants for
  registration and login. The override must not change `verifyPowSolution`, must
  not change hash target verification, and must not read or lower
  `MIN_CHANNEL_DIFFICULTY` or `MIN_MESSAGE_DIFFICULTY`.
- Keep the E2E proof-of-work path honest: Playwright should exercise
  `usePowMiner`, `@keypears/pow5`, the WGSL/WebGPU implementation, the existing
  server challenge signature, hash target verification, replay protection, and
  PoW logging.
- Add a Playwright WebGPU preflight spec or setup check that runs before account
  lifecycle assertions and verifies:
  - `navigator.gpu` is present;
  - `navigator.gpu.requestAdapter()` returns an adapter;
  - the browser can solve a minimal real KeyPears PoW challenge at the configured
    E2E difficulty.
    If this fails, the error must explain that the local Playwright browser needs
    real WebGPU support rather than silently skipping or bypassing PoW.
- Configure Playwright's default browser target as Chromium with
  `--headless=new`, `--enable-unsafe-webgpu`, and Metal-backed GPU flags suitable
  for macOS. Prefer Playwright's managed Chromium first; if the preflight proves
  that managed Chromium cannot expose a compatible adapter on this machine,
  switch the config to a system Chrome channel and document the local
  prerequisite. The final committed plan/result must name the browser/channel
  that passed the preflight.
- If the difficulty override introduces a new env var through
  `webapp/src/lib/config.ts`, update `webapp/src/docs/self-hosting.md` in the
  same experiment. Prefer keeping the override local to the PoW server module if
  it is truly E2E/dev-only and not part of self-hosting configuration.
- Add Playwright helper utilities for unique test users, account creation,
  onboarding, logout, and login.
- Add a first E2E spec that:
  - starts from a clean primary E2E database;
  - visits `https://keypears.test`;
  - creates a new unsaved account;
  - completes onboarding with a full `name@keypears.test` address and password;
  - verifies the authenticated home page;
  - logs out;
  - logs back in with the same address and password;
  - verifies the authenticated home page again.
- Keep this experiment single-domain. Cross-domain federation belongs in a later
  experiment after the harness is proven.

## Verification

- Run the primary E2E database clear and push scripts.
- Verify the E2E database is `keypears_e2e`, not `keypears` or
  `keypears_test`.
- Start Caddy from `~/.config/caddy/Caddyfile` or verify it is already running.
- Run Playwright with its managed `webServer`, and verify it starts the primary
  E2E dev server on port `3500` with `reuseExistingServer: false`.
- Verify Playwright reaches the app at `https://keypears.test` with
  `ignoreHTTPSErrors: true` rather than using raw localhost.
- Run the WebGPU preflight and confirm the Playwright browser exposes
  `navigator.gpu`, returns an adapter, and solves a real low-difficulty KeyPears
  PoW challenge.
- Run the new Playwright account lifecycle test.
- Run relevant TypeScript/package checks for files touched by this experiment.
- Verify no production PoW difficulty constants, minimums, or verification logic
  were weakened and no test-only PoW bypass exists.
- Run `scripts/build-issues-index.sh`.

## Design Review

External Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0002-playwright-account-lifecycle-harness.md \
  --context webapp/src/server/pow.server.ts \
  --context webapp/src/lib/use-pow-miner.ts \
  --context webapp/package.json \
  "You are reviewing KeyPears work. Take a code-review stance: findings first, ordered by severity, with file/line references where possible.

Task:
Audit Issue 42 Experiment 2 design before implementation. The user explicitly rejected a test-only proof-of-work bypass and wants Playwright tests to perform real WebGPU mining at low difficulty. Review whether the experiment design is coherent, scoped correctly, and verifiable before the plan is committed.

Questions:
1. Is the design internally consistent with real WebGPU PoW and no bypass path?
2. Are the difficulty override, WebGPU preflight, database isolation, Caddy dependency, Playwright browser/channel requirements, and production-safety checks specified well enough for implementation?
3. What concrete changes, if any, are required before committing this experiment plan?
4. If nothing should change, say that clearly."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-063251-238024-prompt.md`
- Stdout:
  `logs/claude-review/20260630-063251-238024-stdout.json`
- Verdict: **Changes required**
- Required findings:
  - specify TLS trust for Caddy's internal CA;
  - commit the design to a concrete WebGPU browser/channel and launch flags;
  - specify Playwright-managed E2E server lifecycle and port `3500` contention
    policy;
  - name a distinct E2E database;
  - pin the difficulty override to challenge issuance without weakening
    production constants, minimums, or verification;
  - state whether the E2E server should preserve
    `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- Resolution: this experiment design now sets `ignoreHTTPSErrors: true`, uses a
  dedicated `keypears_e2e` database, requires Playwright `webServer` ownership
  with `reuseExistingServer: false`, specifies a Chromium WebGPU launch
  configuration, pins the PoW override to non-production challenge issuance
  only, and keeps `NODE_TLS_REJECT_UNAUTHORIZED=0` in the E2E server script.

Follow-up external Claude review via:

```bash
python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0002-playwright-account-lifecycle-harness.md \
  --context webapp/src/server/pow.server.ts \
  --context webapp/src/lib/use-pow-miner.ts \
  --context webapp/package.json \
  "You are reviewing KeyPears work. Take a code-review stance: findings first, ordered by severity, with file/line references where possible.

Task:
Follow-up design review for Issue 42 Experiment 2. A prior review returned CHANGES REQUIRED for TLS trust, concrete WebGPU browser config, Playwright-managed server lifecycle/port 3500 policy, distinct E2E database, difficulty override wiring, and NODE_TLS_REJECT_UNAUTHORIZED parity. The experiment has been revised to address those points.

Questions:
1. Are the prior required findings resolved well enough to commit this experiment plan before implementation?
2. Are there any remaining blockers that must change before implementation?
3. If the design is acceptable, say VERDICT: APPROVED."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-063604-321725-prompt.md`
- Stdout:
  `logs/claude-review/20260630-063604-321725-stdout.json`
- Verdict: **Approved**
- Non-blocking implementation note: Playwright's browser context
  `ignoreHTTPSErrors` does not automatically cover `webServer` readiness checks.
  During implementation, either set `ignoreHTTPSErrors: true` on the `webServer`
  block or point the readiness check at the raw local upstream while keeping
  browser navigation on `https://keypears.test`.

## Result

Pass.

Implemented the first Playwright E2E harness for the primary KeyPears local
domain:

- added `@playwright/test` to `webapp`;
- added root and webapp `e2e` scripts;
- added `webapp/playwright.config.ts` targeting `https://keypears.test` through
  Caddy;
- configured Playwright `webServer` to start the E2E KeyPears server on port
  `3500` with the E2E env file and `reuseExistingServer: false`;
- set both browser-context and `webServer` `ignoreHTTPSErrors: true` for Caddy's
  internal TLS CA;
- added `webapp/.env.e2e` with non-production local settings and the dedicated
  `keypears_e2e` database;
- added E2E database creation/reset scripts, with `db:clear:e2e` using
  `--force` so repeat runs are non-interactive;
- added an E2E-only low-difficulty PoW challenge issuance override via
  `KEYPEARS_E2E_POW_DIFFICULTY`;
- kept `verifyPowSolution`, target verification, production PoW constants, and
  production-enforced minimums unchanged;
- added a Playwright WebGPU preflight and account lifecycle smoke test;
- updated self-hosting docs to state that `KEYPEARS_E2E_POW_DIFFICULTY` must
  not be set in production and that production deployments must run with
  `NODE_ENV=production`;
- added an accessible label to the user menu trigger so logout can be tested
  through stable role selectors;
- added generated-output ignores for review logs and Playwright artifacts.

The passing browser/channel was Playwright-managed Chromium 148.0.7778.96
(`chromium-webgpu`) with `--headless=new`, `--enable-unsafe-webgpu`, and
`--use-angle=metal`.

Verification run:

```bash
caddy validate --config /Users/astrohacker/.config/caddy/Caddyfile
bun run db:reset:e2e
bun run e2e
bun run typecheck
bun run lint
bunx prettier --check package.json src/components/UserDropdown.tsx src/server/pow.server.ts playwright.config.ts e2e/account-lifecycle.spec.ts e2e/helpers/account.ts scripts/create-e2e-db.ts ../issues/0042-global-caddy-and-playwright-coverage/README.md ../issues/0042-global-caddy-and-playwright-coverage/exp-0002-playwright-account-lifecycle-harness.md
scripts/build-issues-index.sh
```

Observed results:

- Caddy config validated successfully.
- `bun run db:reset:e2e` created/cleared/pushed schema for `keypears_e2e`.
- `bun run e2e` passed: 2 tests, including a WebGPU preflight that solves a
  real account-creation PoW challenge and a create/logout/login account
  lifecycle through `https://keypears.test`.
- `bun run typecheck` passed.
- `bun run lint` passed with four existing `no-map-spread` warnings in
  unrelated server functions and no errors.
- Touched-file Prettier check passed.
- `scripts/build-issues-index.sh` reported `4 open, 38 closed`.

## Conclusion

Experiment 2 established the reusable local E2E harness for KeyPears account
lifecycle testing. The harness runs through shared Caddy HTTPS routing, owns the
primary E2E server lifecycle on port `3500`, resets a dedicated `keypears_e2e`
database, and exercises real browser WebGPU proof-of-work at low non-production
challenge difficulty. The implementation did not add a PoW bypass and did not
weaken production PoW verification, constants, or minimums. Production safety
depends on production deployments running with `NODE_ENV=production`, now
documented in self-hosting docs alongside the E2E-only difficulty variable.

## Completion Review

External Claude review via:

```bash
git diff --staged | python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0002-playwright-account-lifecycle-harness.md \
  "You are reviewing KeyPears work. Take a code-review stance: findings first, ordered by severity, with file/line references where possible.

Task:
Completion review for Issue 42 Experiment 2. Review the staged diff plus issue/experiment result language. The experiment implements the first Playwright E2E harness for account lifecycle over Caddy HTTPS with real WebGPU PoW at low non-production difficulty.

Verification claimed and run:
- caddy validate --config /Users/astrohacker/.config/caddy/Caddyfile passed.
- bun run db:reset:e2e passed and used keypears_e2e.
- bun run e2e passed: 2 tests, WebGPU preflight and create/logout/login over https://keypears.test.
- bun run typecheck passed.
- bun run lint passed with four existing unrelated warnings and no errors.
- touched-file Prettier check passed.
- scripts/build-issues-index.sh passed.

Questions:
1. Does the implementation match the approved experiment design?
2. Are there correctness, security, production-safety, workflow, or test reliability issues that must be fixed before committing the result?
3. Is the experiment result/conclusion language accurate?
4. If acceptable, say VERDICT: APPROVED."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-064612-426737-prompt.md`
- Stdout:
  `logs/claude-review/20260630-064612-426737-stdout.json`
- Verdict: **Changes requested**
- Required findings:
  - the preflight did not itself solve a real challenge even though the design
    required a real-solve preflight;
  - production safety for `KEYPEARS_E2E_POW_DIFFICULTY` depended on
    `NODE_ENV=production` but that invariant was not documented.
- Resolution: the preflight now starts account creation, waits for onboarding
  after real browser WebGPU PoW, and deletes the unsaved account before the
  lifecycle test. Self-hosting docs now state that
  `KEYPEARS_E2E_POW_DIFFICULTY` must not be set in production and that
  production deployments must run with `NODE_ENV=production`.

Follow-up external Claude review via:

```bash
git diff --staged | python3 skills/claude-review/scripts/claude_review.py \
  --context issues/0042-global-caddy-and-playwright-coverage/README.md \
  --context issues/0042-global-caddy-and-playwright-coverage/exp-0002-playwright-account-lifecycle-harness.md \
  "You are reviewing KeyPears work. Take a code-review stance: findings first, ordered by severity, with file/line references where possible.

Task:
Follow-up completion review for Issue 42 Experiment 2. A prior completion review requested two fixes: strengthen the preflight so it solves a real challenge, and document the production NODE_ENV safety dependency for KEYPEARS_E2E_POW_DIFFICULTY. The staged diff has been updated.

Verification rerun after fixes:
- bun run e2e passed: 2 tests; the preflight now starts account creation, solves real WebGPU PoW, reaches onboarding, deletes the unsaved account, then the lifecycle test creates/logs out/logs in.
- bun run typecheck passed.
- bun run lint passed with four existing unrelated warnings and no errors.
- scripts/build-issues-index.sh passed from repo root.

Questions:
1. Are the prior required findings resolved?
2. Are there any remaining blockers before committing the result?
3. Is the experiment result/conclusion language accurate now?
4. If acceptable, say VERDICT: APPROVED."
```

- Session: `e82c0071-96fc-4e3a-98a4-deb13904774d`
- Prompt:
  `logs/claude-review/20260630-065057-876828-prompt.md`
- Stdout:
  `logs/claude-review/20260630-065057-876828-stdout.json`
- Verdict: **Approved**
- Resolution: no remaining blockers; the result is approved for commit.
