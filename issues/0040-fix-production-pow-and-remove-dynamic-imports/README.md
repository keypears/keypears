+++
status = "open"
opened = "2026-05-20"
+++

# Issue 40: Fix Production PoW and Remove Dynamic Imports

## Goal

Restore production login proof-of-work and remove all dynamic imports from the
application codebase.

## Background

Production login currently fails while development login works. The first
production symptom was an indefinite "Computing proof of work..." spinner with
no visible console error because `PowModal` swallowed miner failures with an
empty `.catch()`.

After surfacing that failure, production reports:

```text
Proof of work failed

Cannot read properties of undefined (reading 'fromHex')
```

That points at the dynamic import of `@webbuf/fixedbuf` inside the browser PoW
miner. Development resolves the dynamic import, but the production bundle does
not expose the expected named export through the generated chunk. The result is
`FixedBuf === undefined`, followed by `FixedBuf.fromHex(...)` throwing before
mining begins.

This is part of the same class of problem as the prior production-only PoW
failure: runtime dynamic imports changed what production actually executes, and
the app hid the failure badly enough that the first symptom looked like a
stalled miner instead of a real exception.

## Recent Changes Implicated

- `8ad11e93 Publish npm packages` changed `@keypears/pow5` to ship and resolve
  through built `dist` files.
- `f4daec56 Build workspace packages in Docker` made production Docker builds
  build and consume workspace package output.
- The browser PoW miner used runtime imports for `@keypears/pow5` and
  `@webbuf/fixedbuf`.
- The attempted mitigation introduced a `@keypears/pow5/wgsl` subpath but still
  kept dynamic imports in the miner, leaving production exposed to chunk/export
  mismatch.

## Current Dynamic Imports

The current audit found dynamic imports in:

- `webapp/src/lib/use-pow-miner.ts`
- `webapp/src/routes/_app/_saved/sign.tsx`
- `webapp/src/server/blog.functions.ts`
- `webapp/src/server/message.functions.ts`
- `webapp/src/server/user.server.ts`
- `webapp/src/server/federation.server.ts`

These must be removed or replaced with static imports. No application code
should depend on runtime `import(...)`.

## Requirements

- Production login PoW must work.
- Development login PoW must continue to work.
- Remove every dynamic import from app code.
- Use static imports for browser PoW dependencies.
- Keep the browser miner on a WASM-free PoW path if production CSP or bundling
  makes eager WASM unsafe for login.
- Do not hide PoW failures. If mining cannot start, the user must see an error
  state and the browser console must include the thrown error.
- Add or update tests/build checks so production-only import failures are caught
  before deploy.
- Re-run a production build and inspect the generated PoW chunk to confirm it
  uses the intended static dependency graph.

## Non-Goals

- Do not redesign the PoW algorithm.
- Do not change proof-of-work difficulty, challenge format, or verification
  semantics.
- Do not loosen production CSP as a workaround unless a later experiment proves
  it is necessary and gets explicit approval.
- Do not keep dynamic imports as an optimization.

## Experiment 1: Surface the Production PoW Failure

### Hypothesis

The production login spinner is hiding a real browser-side PoW startup failure.
If miner errors are surfaced instead of swallowed, production will reveal the
actual exception and give us a concrete fix target.

### Changes

- Added a visible PoW error state in `PowModal`.
- Logged rejected miner promises instead of swallowing them with an empty
  `.catch()`.
- Added a WASM-free `@keypears/pow5/wgsl` package subpath and moved browser
  mining toward that entry point.
- Replaced the browser-side `Pow5_64b_Wasm.insertNonce()` call with equivalent
  JavaScript nonce insertion.

### Result: Partial Success

This did not fix production login. Production still cannot complete login PoW.

It did, however, turn the silent infinite spinner into an actionable production
error:

```text
Proof of work failed

Cannot read properties of undefined (reading 'fromHex')
```

That error shows the remaining failure is caused by runtime dynamic import
resolution in the production bundle, specifically the miner's dynamic import of
`@webbuf/fixedbuf`. The next experiment must remove dynamic imports instead of
trying to route around them.

### Conclusion

The experiment failed to restore production login, but succeeded in revealing
the next concrete defect. The current partial mitigation should not be treated
as complete until production login works and all dynamic imports are removed
from application code.

## Experiment 2: Restore the Static Type Graph

### Hypothesis

Production PoW is failing because required dependencies are loaded through
runtime dynamic imports instead of static imports. Removing application dynamic
imports will put those dependencies back into TypeScript's static graph and make
production bundling fail at build time instead of failing at login time.

### Plan

1. Replace browser PoW dynamic imports with static imports.
   - `FixedBuf` must be statically imported from `@webbuf/fixedbuf`.
   - `Pow5_64b_Wgsl` and `hashMeetsTarget` must be statically imported from the
     WASM-free `@keypears/pow5/wgsl` entry point.
   - Keep JavaScript nonce insertion so the login miner does not need the WASM
     `Pow5_64b_Wasm` export.

2. Remove the remaining application dynamic imports found by audit.
   - Replace `webapp/src/routes/_app/_saved/sign.tsx` dynamic `FixedBuf` import
     with its existing static import.
   - Replace server-function dynamic imports with static imports where they do
     not create client bundle exposure.
   - If a server-only import was dynamic only to avoid client exposure, move the
     code behind a `*.server.ts` boundary or another existing server-only module
     instead of keeping `import(...)`.

3. Add an enforcement check.
   - Add a script or test that fails when application source contains `import(`.
   - Scope it to application code, not generated output or third-party
     dependencies.
   - Document the rule in the issue result so future exceptions require an
     explicit issue decision.

4. Verify TypeScript and production build behavior.
   - Run `pnpm --filter @keypears/pow5 run build`.
   - Run `pnpm --filter @keypears/webapp run typecheck`.
   - Run `pnpm --filter @keypears/webapp run build`.
   - Inspect the generated production PoW chunk and confirm it no longer
     contains a dynamic import for `@webbuf/fixedbuf`.
   - Audit with `rg -n "import\\("` and confirm no application dynamic imports
     remain.

### Expected Result

Production login PoW starts from statically linked dependencies. The specific
`Cannot read properties of undefined (reading 'fromHex')` failure becomes
impossible because `FixedBuf` is no longer obtained by destructuring a runtime
module object.

### Result: Pass

Application dynamic imports were removed from the audited source paths. Browser
PoW now imports `FixedBuf`, `Pow5_64b_Wgsl`, and `hashMeetsTarget` statically,
so the login miner no longer destructures required dependencies from runtime
module objects.

The remaining dynamic import sites were converted to static imports:

- signing challenge generation
- blog server functions
- message PoW logging
- PoW settings validation
- federation `keypears.json` validation

A Vitest guard now scans app source for `import(...)` and fails if a dynamic
import is reintroduced.

Verification:

- `pnpm --filter @keypears/pow5 run build`
- `pnpm --filter @keypears/webapp run typecheck`
- `pnpm --filter @keypears/webapp run test`
- `pnpm --filter @keypears/webapp run build`
- `rg -n "import\\(" webapp/src packages/client/src packages/pow5-ts/src passapples lockberries -S`

The production `PowModal` asset now contains the PoW implementation and static
`FixedBuf` usage in the same bundle path; there is no dynamic import for
`@webbuf/fixedbuf`.

### Conclusion

The TypeScript static dependency graph is restored for app code. The production
`FixedBuf.fromHex` undefined failure should be eliminated because `FixedBuf` is
now a static binding, not a runtime destructured property.

## Experiment 3: Diagnose Running-but-Not-Solving PoW

### Hypothesis

Production PoW is no longer failing to start. The browser is running GPU work,
but the miner never accepts a solution. The misleading progress bar reaches 100%
because progress is currently derived from elapsed time and estimated remaining
time, not from real proof completion.

The key unknown is whether production `pow5.work()` is returning all-zero
hashes, non-zero hashes that never satisfy the target, malformed challenge data,
or solved headers that fail after submission.

### Evidence

- Production no longer shows the `FixedBuf.fromHex` error after dynamic imports
  were removed.
- The machine's fans spin up during login, indicating GPU work is likely
  running.
- The progress bar stays flat, then reaches 100% and reports "less than a second
  remaining" even though no solution is accepted.
- A locally served production build against the dev environment logs in
  successfully, so the problem is not reproduced by production bundling alone.

### Plan

1. Fix the misleading progress display.
   - Do not allow the progress bar to reach 100% unless a solution was found.
   - Prefer an indeterminate progress state, or cap estimated progress below
     completion (for example 95%) while mining.
   - Keep hash count and time estimate separate from actual completion state.

2. Add miner diagnostics that are visible when PoW does not make progress.
   - Track completed batch count and total hash count.
   - Track consecutive all-zero hash batches.
   - Track whether any non-zero hash has been observed.
   - Track the first few returned hash prefixes and nonce values in memory for
     debugging.
   - Include challenge difficulty, target prefix, and elapsed time.

3. Fail loudly on impossible-looking WebGPU output.
   - If many consecutive batches return an all-zero hash, stop mining and show a
     clear error instead of looping forever.
   - The threshold should be high enough to avoid false positives, but low
     enough to make the production failure actionable.
   - Include the diagnostic summary in the console error.

4. Distinguish "working but unlucky" from "broken".
   - If non-zero hashes are returned but no solution is found, keep mining and
     show batch/hash count.
   - If the hash rate estimate is implausibly high, show the raw batch count so
     the UI does not imply guaranteed completion.

5. Verify locally and in production.
   - Run `pnpm --filter @keypears/webapp run typecheck`.
   - Run `pnpm --filter @keypears/webapp run test`.
   - Run `pnpm --filter @keypears/webapp run build`.
   - Test login on the locally served production build.
   - Deploy and use the diagnostics to determine whether production is seeing
     all-zero hashes, non-zero misses, malformed challenge data, or a submit
     failure.

### Expected Result

The UI no longer falsely suggests PoW completion. If production WebGPU output is
broken, the miner stops with a diagnostic error instead of spinning forever. If
production is computing valid non-zero batches but not finding solutions, the
diagnostics will show that and the next experiment can focus on challenge target
or server verification.

### Result: Pass

The miner now exposes the data needed to distinguish a slow search from a
broken production path.

Changes:

- Progress is capped below completion while mining and reaches 100% only after a
  solution is found.
- Once the expected batch count is exceeded, the UI switches from a misleading
  remaining-time estimate to "searching past estimate."
- The modal displays completed batch count and hash count while mining.
- The miner tracks diagnostic state: batch count, total hash count,
  zero-result batches, non-zero result batches, expected batches, overrun
  limit, target prefix, difficulty, elapsed time, hash rate, and sample
  non-zero result hashes.
- The miner throws a diagnostic error after a large overrun threshold instead
  of looping forever.

Important implementation note: an all-zero result hash is the current WGSL
sentinel for "no solution in this batch." It is not automatically evidence of
broken WebGPU output. The overrun threshold is based on expected batch count
rather than treating zero batches as immediate failure.

Verification:

- `pnpm --filter @keypears/webapp run typecheck`
- `pnpm --filter @keypears/webapp run test`
- `pnpm --filter @keypears/webapp run build`
- `rg -n "import\\(" webapp/src packages/client/src packages/pow5-ts/src passapples lockberries -S`

The production `PowModal` asset contains the diagnostic strings and overrun
logic.

### Conclusion

The app still needs production deployment feedback to identify the root cause,
but it will no longer present false completion progress or hide indefinite PoW
searches. The next production run should reveal whether the issue is excessive
zero-result batches, non-zero candidates that fail target comparison, malformed
challenge data, or a submit/verification path after a solution is found.

## Experiment 4: Restore Vite Raw WGSL Loading

### Hypothesis

Production PoW broke when `@keypears/pow5` stopped loading WGSL through Vite's
known-working `?raw` import path and started loading generated
`*-wgsl-code.ts` string modules for npm publishing. The app should prioritize
the working Vite path over package portability.

The production diagnostics from Experiment 3 showed:

```json
{
  "batchCount": 4280,
  "hashCount": 140247040,
  "zeroResultBatches": 4280,
  "nonZeroResultBatches": 0,
  "expectedBatches": 214,
  "overrunLimit": 4280,
  "targetPrefix": "000002659116f56b",
  "difficulty": 7000000
}
```

The GPU miner is running, but the shader never writes a winning result. The
most suspicious recent change in that exact path is the replacement of:

```ts
import wgslCode from "./pow5-64b.wgsl?raw";
```

with:

```ts
import wgslCode from "./pow5-64b-wgsl-code.ts";
```

### Plan

1. Revert the WGSL imports back to Vite raw source loading.
   - Change `packages/pow5-ts/src/pow5-64b-wgsl.ts` to import
     `./pow5-64b.wgsl?raw`.
   - Change `packages/pow5-ts/src/pow5-217a-wgsl.ts` to import
     `./pow5-217a.wgsl?raw`.

2. Stop using generated WGSL string modules for the app path.
   - Do not run or depend on `build-wgsl-modules.ts` for the webapp build.
   - It is acceptable if npm publishing becomes less portable; production login
     is the priority.

3. Keep the existing browser PoW diagnostics temporarily.
   - They verify whether the raw WGSL path restores non-zero or successful
     result batches in production.
   - Remove or reduce them only after login is confirmed stable.

4. Verify locally.
   - Run `pnpm --filter @keypears/webapp run typecheck`.
   - Run `pnpm --filter @keypears/webapp run test`.
   - Run `pnpm --filter @keypears/webapp run build`.
   - Serve the local production build against dev env and confirm login still
     works.

5. Deploy and verify production login.
   - Expected production behavior is that the miner finds a solution in roughly
     the expected number of batches for 7M difficulty.
   - If production still shows all-zero result batches, the generated WGSL
     module was not the root cause.

### Expected Result

Production returns to the same Vite WGSL ingestion path used before the npm
publishing change. If the generated WGSL string module caused the break,
production login PoW should complete again.

### Result: Pending Production Verification

The WGSL imports were reverted to Vite raw loading:

- `packages/pow5-ts/src/pow5-64b-wgsl.ts` now imports
  `./pow5-64b.wgsl?raw`.
- `packages/pow5-ts/src/pow5-217a-wgsl.ts` now imports
  `./pow5-217a.wgsl?raw`.

Local verification passed:

- `pnpm --filter @keypears/pow5 run build`
- `pnpm --filter @keypears/webapp run typecheck`
- `pnpm --filter @keypears/webapp run test`
- `pnpm --filter @keypears/webapp run build`
- `rg -n "import\\(" webapp/src packages/client/src packages/pow5-ts/src passapples lockberries -S`

The rebuilt `@keypears/pow5` output now preserves `.wgsl?raw` imports in
`dist`, and the webapp production build bundles the raw WGSL code into the
`PowModal` asset. The existing diagnostics remain in place until production
login is verified.

Production verification showed the same failure:

```text
Proof of work exceeded 4280 batches without a solution.
```

Because Docker copies the dirty working tree into the build context with
`COPY . .`, the raw-WGSL change was included in the deployed image. This means
the generated WGSL string module is probably not the root cause.

## Experiment 5: Revert Runtime Code and Config to the Known Working Baseline

### Hypothesis

Production PoW broke during the May 16-20 change burst. Reverting all runtime
code, build config, package config, Docker config, and app config back to the
known working baseline from `9d2dc9c8` will restore production login.

Issue documentation should be preserved so the project keeps the record of what
happened, but the executable app should return to the
pre-pnpm/pre-npm/pre-Nitro/pre-SSRF/pre-PoW-debug state.

### Baseline

Known working baseline:

```text
9d2dc9c8 2026-04-27 19:28:47 -0500 Include whitepaper PDF in Docker builds
```

Recent change burst begins:

```text
8136918d 2026-05-16 15:39:12 -0500 Open pnpm migration issue
```

### Scope

Revert all non-issue code/config changes after `9d2dc9c8`.

Preserve:

- `issues/**`
- `issues/README.md`

Revert:

- Toolchain migration: pnpm/Node back to Bun
- Lockfiles/workspace files: restore Bun lock state, remove pnpm workspace
  state
- Dockerfile and deploy/runtime config
- TanStack/Nitro server changes
- npm publishing package config
- generated WGSL string module publishing path
- package `dist`/exports build setup changes
- app dynamic import removals
- PoW modal/miner diagnostics and WGSL export changes
- SSRF federation fetch hardening/simplification runtime code
- type-safe navigation runtime/component changes
- AGENTS-driven runtime changes
- generated public feed timestamp churn
- any other non-issue source/config file changed after the baseline

### Plan

1. Save the current issue documentation.

   Create a temporary patch or copy of:

   ```text
   issues/
   ```

   This prevents issue history from being lost when the tree is reset to the
   baseline state.

2. Restore the repository's executable tree from `9d2dc9c8`.

   Use Git path restore from the baseline for tracked files, then re-apply the
   saved `issues/` documentation.

   Conceptually:

   ```bash
   git restore --source 9d2dc9c8 -- .
   git restore --source HEAD -- issues
   ```

   Then manually handle files that were added after `9d2dc9c8` and should
   disappear from runtime/config, such as:

   ```text
   .npmrc
   pnpm-lock.yaml
   pnpm-workspace.yaml
   packages/client/tsconfig.build.json
   packages/pow5-ts/build-wgsl-modules.ts
   packages/pow5-ts/src/pow5-64b-wgsl-code.ts
   packages/pow5-ts/src/pow5-217a-wgsl-code.ts
   packages/pow5-ts/src/wgsl.ts
   webapp/src/no-dynamic-imports.test.ts
   webapp/src/lib/federation-authority.ts
   webapp/src/server/fetch.test.ts
   webapp/src/components/ExternalLink.tsx
   webapp/src/lib/navigation.ts
   passapples/src/components/ExternalLink.astro
   lockberries/src/components/ExternalLink.astro
   ```

3. Preserve intentional non-runtime docs only if explicitly desired.

   Default preservation is only `issues/**`. Other docs that changed during the
   burst, like `AGENTS.md`, `README.md`, and `webapp/src/docs/*`, should revert
   with code/config unless explicitly kept.

4. Verify the reverted tree matches the baseline for runtime files.

   Compare against `9d2dc9c8` excluding issue docs:

   ```bash
   git diff --name-status 9d2dc9c8 -- . ':(exclude)issues/**'
   ```

   Expected result: only issue docs should differ from the baseline. Any
   remaining code/config difference must be reviewed explicitly before
   proceeding.

5. Run the baseline build/test commands.

   Since the baseline is Bun-based, verify with the baseline commands:

   ```bash
   bun install
   bun run build
   ```

   If the baseline uses webapp-specific commands:

   ```bash
   cd webapp
   bun run typecheck
   bun run test
   bun run build
   ```

6. Deploy and verify production login.

   Production verification is the actual pass/fail condition.

   Expected result:

   - Login PoW completes.
   - No overrun diagnostic exists, because that diagnostic code is reverted.
   - Production behaves like the pre-May-16 app.

### Success Criteria

- Runtime/code/config files match `9d2dc9c8`.
- Issue documentation remains current.
- Bun-based local build succeeds.
- Production login PoW works after deploy.

### Failure Criteria

- Any runtime/config file unintentionally remains on the May 16-20 code path.
- Local baseline build cannot run.
- Production login PoW still fails after the full revert.

### Important Note

This experiment intentionally sacrifices the npm publishing work, pnpm
migration, Nitro server work, SSRF hardening implementation, navigation
refactors, and PoW diagnostics. Those can be reintroduced one at a time only
after production login is confirmed working again.

### Result: Implemented, Pending Production Verification

All non-issue runtime/code/config files were restored to the known working
baseline at `9d2dc9c8`. Issue documentation was preserved.

The rollback restores the app to the Bun-based pre-pnpm/pre-npm/pre-Nitro
state, including the previous Dockerfile, package scripts, Bun lockfiles,
raw WGSL loading path, and pre-diagnostic PoW UI/miner code. The pnpm
workspace files, npm publishing artifacts, generated WGSL string modules,
SSRF runtime hardening implementation, navigation refactor components, and
PoW diagnostic code are removed from the runtime tree.

Local verification passed:

- `bun install --frozen-lockfile`
- `bun run --cwd webapp typecheck`
- `bun run --cwd webapp test`
- `bun run --cwd webapp build`

The build regenerated blog feed timestamps, which were restored back to the
baseline contents afterward. Production deployment is still required to confirm
whether reverting to the known working runtime state restores login PoW.

Production verification failed. After redeploying the baseline rollback,
production login still hangs in the mining modal:

```text
Computing proof of work...

This short computation protects the network from spam while keeping your
identity private.

7M
less than a second remaining
```

The modal gives no browser-console information, sometimes jumps the progress
bar, and never solves. Development login still works. The rollback therefore
did not isolate the regression.

## Experiment 6: Browser Console PoW Diagnostics

### Hypothesis

The production failure is inside the browser PoW mining path, before login
submission, or production is not actually running the artifact we think it is.
WebGPU is available and the mining loop is running, but production either
returns all-zero sentinel results forever, computes a different hash than the
WASM reference for the same header, loses the GPU device, receives a malformed
challenge, runs a stale browser/deploy artifact, or throws an error that the
modal currently swallows.

Adding explicit browser-console diagnostics at the PoW boundary will reveal the
first dev/prod difference.

### Evidence

- Experiment 5 restored the non-issue runtime tree to `9d2dc9c8`, the April 27
  baseline, but production login still failed after redeploy. This rules out
  the May 16-20 npm/pnpm/Nitro/package-publishing burst as the direct cause.
- Development login works.
- Production login fetches a challenge and enters the mining modal.
- Production does not show a browser-console error.
- Current `PowModal` hides miner failures with `.catch(() => {})`.
- Prior diagnostics showed production exceeding 4,280 batches with 4,280
  all-zero result batches and no non-zero samples.
- WebGPU failures can appear as valid execution that returns all-zero buffers,
  so the app must treat persistent zero results as diagnostic evidence instead
  of silently continuing forever.
- The remaining live hypotheses are now stale deployed/browser artifacts,
  browser or GPU driver behavior, device loss, production headers/CSP, malformed
  production challenge data, AWS/deploy differences, or a real PoW WebGPU bug.

### Plan

1. Log a build fingerprint at miner startup.

   Inject a build identifier into the webapp bundle and log it before mining:

   - git SHA when available
   - build timestamp as a fallback

   Example console output:

   ```text
   [keypears pow] build { sha: "...", builtAt: "..." }
   ```

   This proves whether the production browser is running the deployed rollback
   artifact, rather than a stale chunk, stale image layer, browser cache, CDN
   edge, or other old artifact.

2. Stop swallowing miner errors.

   Replace the empty catch in `PowModal` with a console error:

   ```ts
   miner.mine(challenge, { showSolved: true }).catch((err) => {
     console.error("[keypears pow] mining failed", err);
   });
   ```

3. Add console diagnostics with a stable prefix.

   Every diagnostic log should begin with:

   ```text
   [keypears pow]
   ```

   Log the raw challenge object and field types when mining starts:

   - full challenge object
   - difficulty
   - `typeof difficulty`
   - target prefix
   - `typeof target`
   - header prefix
   - `typeof header`
   - `typeof expiresAt`
   - `typeof signature`
   - whether sender/recipient addresses are present

4. Log browser, origin, visibility, and CSP context.

   At miner startup, log:

   - `navigator.userAgent`
   - `location.origin`
   - `isSecureContext`
   - `crossOriginIsolated`
   - `document.visibilityState`

   Install temporary listeners while mining:

   ```ts
   document.addEventListener("visibilitychange", ...);
   window.addEventListener("securitypolicyviolation", ...);
   ```

   Log CSP violations with blocked URI, violated directive, effective
   directive, and source file/line when available.

5. Log WebGPU initialization details.

   During miner startup, log:

   - whether `navigator.gpu` exists
   - adapter availability
   - `adapter.info` if available
   - `adapter.isFallbackAdapter`
   - selected device limits/features if cheap to read
   - WGSL source length
   - initialized pipeline names

   Add a `device.lost` handler immediately after requesting the device:

   ```ts
   device.lost.then((info) => {
     console.error("[keypears pow] device lost", info.reason, info.message);
   });
   ```

   Device loss is a plausible explanation for "GPU starts, fans spin, then
   readbacks return zeros forever."

6. Add a same-header WASM-vs-GPU self-check.

   Initialize the WGSL miner with debug pipelines:

   ```ts
   await pow5.init(true);
   ```

   Before entering the batch loop, compute both hashes for the exact challenge
   header:

   ```ts
   const wasmHash = Pow5_64b_Wasm.elementaryIteration(headerBuf);
   const gpuHash = await pow5.debugElementaryIteration();
   ```

   Log:

   - WASM hash prefix/full hash
   - GPU hash prefix/full hash
   - whether they match

   Interpretation:

   - If they differ, production's shader or bundled WGSL path is wrong.
   - If they match, the basic GPU hash path works and the bug is likely in
     `workgroup_reduce`, batch search, or solution handling.

7. Add a minimum-difficulty smoke test.

   Before the real mining loop, run the same WebGPU mining path with a target
   that any hash should satisfy, using the same challenge header and miner
   machinery.

   The smoke test should answer:

   - Can `work()` ever return a non-zero result in this browser/build?
   - Can the same `workgroup_reduce` path solve an easy target?

   Interpretation:

   - If the smoke test fails, the bug is structural: WGSL, buffers, device loss,
     production bundling, or WebGPU execution.
   - If the smoke test passes, the bug is specific to real target difficulty,
     target construction, randomization, or rare-event search behavior.

8. Track and log batch-level mining state.

   Track:

   - batch count
   - total hash count
   - zero-result batch count
   - non-zero result batch count
   - elapsed seconds
   - hash rate
   - expected batch count
   - first few non-zero hash samples

   Log the first few batches and then periodic summaries, for example:

   - batches 1-5
   - every 100th batch after that

   Include per-batch wall time in the logs. If batch 1 is slow and later batches
   become implausibly fast, that is evidence that the GPU is no longer doing
   real work after initialization.

9. Fail loudly after an excessive overrun.

   Compute:

   ```ts
   expectedBatches = Math.ceil(challenge.difficulty / HASHES_PER_GPU_BATCH)
   overrunLimit = Math.max(1000, expectedBatches * 20)
   ```

   If no solution is found by `overrunLimit`, throw an error with the diagnostic
   summary and log it with `console.error`.

10. Fix misleading progress during diagnostics.

   While mining, cap estimated progress below completion, for example 95%.
   Progress should reach 100% only after a valid solution is found.

11. Verify diagnostics in development first.

   In development, confirm the console shows:

   - build fingerprint
   - challenge summary
   - raw field types
   - browser/origin context
   - WebGPU initialization
   - adapter/fallback details
   - WASM/GPU self-check match
   - minimum-difficulty smoke test pass
   - batch logs
   - successful solution

12. Deploy and inspect production console output.

   Production should reveal one of these outcomes:

   - Build fingerprint is stale or unexpected.
   - Browser/origin/security context differs from expectation.
   - CSP violation appears.
   - Adapter is fallback or unexpected.
   - GPU device is lost.
   - Raw challenge data has wrong field types or malformed values.
   - GPU self-check differs from WASM.
   - Minimum-difficulty smoke test fails.
   - GPU self-check matches, but `work()` returns only zero sentinels.
   - Non-zero hashes appear but never satisfy the target.
   - A swallowed exception is now visible.
   - A solution is found but login fails later.

### Expected Result

The browser console exposes the exact production failure mode. The experiment is
successful if it gives enough evidence to decide whether the next fix belongs
in WGSL bundling, WebGPU shader execution, batch search logic, challenge/target
construction, or post-solution submission.

### Non-Goals

- Do not redesign PoW.
- Do not change difficulty.
- Do not keep verbose console diagnostics permanently.
- Do not start another broad rollback until the diagnostics identify a concrete
  failure point.

### Result: Implemented, Pending Production Verification

Implemented browser-visible PoW diagnostics with the stable
`[keypears pow]` prefix. Mining now logs the webapp build fingerprint, raw
challenge shape and field types, browser/origin/security context, visibility
changes, CSP violations, WebGPU adapter/device details, WGSL initialization,
`device.lost`, a same-header WASM-vs-GPU hash check, a minimum-difficulty
WebGPU smoke test, periodic batch timing, zero-result counts, hash counts, and
overrun diagnostics.

`PowModal` no longer swallows miner failures. Estimated progress is capped below
completion while mining so the modal only reaches completion after a real PoW
solution.

Verification:

- `bun run --cwd webapp typecheck`
- `bun run --cwd packages/pow5-ts typecheck`
- `bun run --cwd webapp test`
- `bun run --cwd webapp build`

`bun run --cwd packages/pow5-ts test` could not complete locally because the
Playwright Chromium browser is not installed in this workspace. The first
sandboxed attempt also hit an `EPERM` localhost listener error; the escalated
rerun reached the missing-browser failure.

Production still needs a redeploy and one login attempt with the browser console
open. The next experiment should be based on the first concrete production
diagnostic that differs from development.

Production verification produced a concrete difference:

```text
[keypears pow] self-check {
  wasmHash: "529a900ba28e0263973f3cab5b2f121e792bdd3c534b5eaab4fb0051947191bc",
  gpuHash: "f473678f945d1d5a63f52a89fbd6a4f069f960265844776ca9ff8bf09572dca3",
  match: false
}
```

The `gpuHash` is the known `Pow5_64b_Wgsl.debugElementaryIteration()` test
vector for an all-zero 64-byte header. Development does not reproduce this
mismatch. That means the next experiment should focus on production-build
differences in the WebGPU input path or bundled pow5 asset, not challenge
creation, target difficulty, login submission, or server verification.

## Experiment 7: Isolate Production Build WebGPU Input

### Hypothesis

The deployed production build is causing the WGSL miner to hash an all-zero
header even though the JavaScript/WASM path receives the real challenge header.
Because development does not reproduce the mismatch, the root cause is likely in
one of these production-build-only surfaces:

- the bundled `@keypears/pow5` asset differs from the source used in dev
- the bundled WGSL string differs from `packages/pow5-ts/src/pow5-64b.wgsl`
- the production bundle writes the wrong data into `headerBuffer`
- the GPU receives the correct buffer but `debug_elementary_iteration` reads a
  different value after bundling/minification
- production is loading a stale or unexpected pow5 chunk

### Evidence

- Dev login succeeds.
- Production login reaches WebGPU initialization.
- Production adapter is not fallback.
- Production build timestamp matches the latest deploy attempt, but the git SHA
  is `unknown` because the Docker build context does not expose git metadata.
- Production WASM hash is not the all-zero test vector, so the challenge header
  reaches JavaScript correctly.
- Production GPU hash is exactly the all-zero-header elementary-iteration test
  vector, so the deployed WebGPU path is probably hashing zero input.

### Plan

1. Add direct GPU header readback.

   Add a debug compute pipeline that copies the current `header` storage buffer
   into `final_result` or into a dedicated readback buffer without hashing it.
   Log:

   - challenge header prefix/full hex
   - `headerBuf` full hex before `Pow5_64b_Wgsl` construction
   - GPU-readback header full hex after `init()`
   - whether the GPU-readback header is all zeros
   - whether the GPU-readback header equals the JS header

   This determines whether the mismatch happens before hashing.

2. Split the self-check by stage.

   In the miner startup diagnostics, log all of these for the same challenge
   header:

   - JS/WASM `matmulWork(header)`
   - WGSL `debugHashHeader()`
   - WGSL `debugMatmulWork()`
   - WGSL `debugElementaryIteration()`

   Interpretation:

   - If GPU header readback is zero, fix buffer upload.
   - If header readback is correct but `debugHashHeader()` matches the zero
     header hash, fix the WGSL `blake3_hash_64` input path.
   - If `debugHashHeader()` is correct but `debugMatmulWork()` differs, fix
     matmul WGSL/bundling.
   - If `debugMatmulWork()` is correct but elementary differs, fix final
     double-hash/compression.

3. Make build identity useful in Docker.

   Keep the timestamp, but allow the deploy/build script or Dockerfile to pass a
   build SHA through an environment variable such as `KEYPEARS_BUILD_SHA`.
   `vite.config.ts` should prefer that explicit value before falling back to
   `git rev-parse`.

   This is diagnostic only. It prevents another production run from reporting
   `sha: "unknown"`.

4. Compare dev and built asset behavior locally.

   Run the same browser console diagnostics in:

   - dev server
   - local production build served with `bun run --cwd webapp start`
   - deployed production

   The same challenge does not need to be reused. The invariant being checked is
   whether GPU readback equals JS header and whether stage hashes agree.

5. Inspect the built pow5 chunk.

   After `bun run --cwd webapp build`, grep the emitted client assets for:

   - `[keypears pow]`
   - `debug_elementary_iteration`
   - WGSL source length
   - header upload code

   Confirm that the production asset contains the current diagnostics and raw
   WGSL string.

6. Fix only after the failing stage is known.

   Do not rewrite PoW or switch algorithms in this experiment. The allowed fix is
   the smallest change that makes the production build pass the same GPU/WASM
   stage checks that dev already passes.

### Expected Result

The next production run identifies the exact production-build-only failure
point:

- header buffer upload/readback
- WGSL BLAKE3 header hashing
- matmul work
- final elementary hash/compression
- stale or unexpected built asset

If the header readback is zero in production and correct in dev, the likely fix
is to change the WebGPU upload path to use an explicit, freshly allocated
`Uint32Array`/`ArrayBuffer` and read it back in tests, instead of relying on any
view or iterable behavior that production bundling might alter.

### Non-Goals

- Do not change login, challenge creation, or server verification.
- Do not change difficulty.
- Do not remove WebGPU.
- Do not do another rollback.
- Do not keep the verbose diagnostics permanently after production login works.

### Result: Implemented, Pending Production Verification

Implemented production-build isolation diagnostics for the WebGPU input path.
The miner now logs:

- direct `headerBuffer` readback from the GPU
- whether GPU-readback header bytes match the JavaScript challenge header
- a shader-level header-prefix readout
- WGSL bundle length exported from `@keypears/pow5`
- staged GPU/WASM comparisons for header hash, matmul work, and elementary
  iteration

The deploy path now passes `KEYPEARS_BUILD_SHA` into the Docker build, and
`vite.config.ts` prefers that value before falling back to `git rev-parse`.
This should stop production diagnostics from reporting `sha: "unknown"` during
normal deploys.

Added a pow5 browser test for `debugReadHeader()` so future browser test runs
verify that WebGPU header-buffer readback matches the input header.

Verification:

- `bun run --cwd packages/pow5-ts typecheck`
- `bun run --cwd webapp typecheck`
- `bun run --cwd webapp test`
- `bun run --cwd webapp build`
- Built client asset contains `header input`, `stage-check`,
  `debug_header_prefix`, `debugReadHeader`, and `KEYPEARS_BUILD_SHA` plumbing.

`bun run --cwd packages/pow5-ts test` still cannot run in this workspace because
Playwright cannot find the Chromium binary at
`~/Library/Caches/ms-playwright/chromium-1217/...`.

The next production run should answer whether the deployed GPU buffer readback
is zero, differs from the JavaScript header, or matches the header while a later
WGSL stage diverges.

Production verification showed:

```text
[Buffer] usage (CopyDst|Storage) doesn't include CopySrc
gpuHeaderReadbackHex: "0000..."
gpuMatmulWork: "b1fee00a999ab4d93dcd2f6ced975c4e8ee110e0a1d48cb094fec3c934d0ee3c"
gpuHash: "f473678f945d1d5a63f52a89fbd6a4f069f960265844776ca9ff8bf09572dca3"
```

The readback result is not yet trustworthy because the readback command is
invalid without `GPUBufferUsage.COPY_SRC`. The stage hashes are trustworthy:
both `gpuMatmulWork` and `gpuHash` match the known all-zero-header test vectors.
Development does not fail this way, so the next step is to isolate why the
production build writes or exposes an all-zero header to WGSL while development
does not.

## Experiment 8: Compare Header Upload Semantics

### Hypothesis

Production and development differ in the JavaScript-to-WebGPU header upload
path. The current code constructs a GPU input array with:

```ts
const headerUint8Array = this.header.buf;
const headerUint32Array = new Uint32Array(headerUint8Array);
device.queue.writeBuffer(headerBuffer, 0, headerUint32Array.buffer);
```

This relies on `this.header.buf` behaving like a plain iterable byte array after
production bundling. It also makes the shader representation unusual: the WGSL
header is `array<u32, 64>`, where each `u32` stores one byte value. Development
may preserve the expected `FixedBuf`/`WebBuf` behavior while the production
bundle changes enough that the derived `Uint32Array` or uploaded buffer becomes
zero.

### Evidence

- Production receives the real challenge header in JavaScript.
- Production WASM hashes the real challenge header.
- Production WGSL hashes the all-zero 64-byte header.
- Production reports the correct deployed commit SHA, so this is not a stale
  asset.
- The direct readback diagnostic needs a `COPY_SRC` fix before it can be used as
  evidence.
- Development succeeds, so the source algorithm and ordinary dev WebGPU path are
  not generally broken.

### Plan

1. Make readback valid, but do not change upload behavior yet.

   Add `GPUBufferUsage.COPY_SRC` to `headerBuffer` so `debugReadHeader()` can
   copy from it. This is diagnostic-only. Do not change the construction or
   upload of `headerUint32Array` in this step.

2. Log the exact JavaScript header upload inputs in dev and production.

   In `Pow5_64b_Wgsl.init()` and `setInput()`, log:

   - `this.header.buf.constructor.name`
   - `this.header.buf.length`
   - `this.header.buf.byteLength`
   - `this.header.buf.byteOffset`
   - `this.header.buf.buffer.byteLength`
   - first 8 bytes from `Array.from(this.header.buf.slice(0, 8))`
   - `headerUint32Array.constructor.name`
   - `headerUint32Array.length`
   - `headerUint32Array.byteLength`
   - first 8 words from `Array.from(headerUint32Array.slice(0, 8))`
   - whether all header bytes are zero
   - whether all header words are zero

   Use the same `[keypears pow]` prefix and label the logs `header upload init`
   and `header upload setInput`.

3. Compare against valid GPU readback.

   Keep the existing `header input` browser log, but after the `COPY_SRC` fix
   compare:

   - JavaScript challenge header
   - `headerBuf.buf`
   - `headerUint32Array` first words
   - GPU `debugReadHeader()` result
   - shader `debug_header_prefix`

   Interpretation:

   - If JavaScript bytes and words are correct but GPU readback is zero, the bug
     is in `queue.writeBuffer()` usage or buffer state.
   - If JavaScript bytes are correct but words are zero/wrong only in
     production, the bug is the `new Uint32Array(headerUint8Array)` conversion.
   - If JavaScript bytes are already zero in production inside
     `Pow5_64b_Wgsl.init()`, the bug is crossing the package/bundle boundary
     before WebGPU sees the value.
   - If GPU readback is correct but shader prefix is zero, the bug is the WGSL
     storage layout or bind group.

4. Run in three environments.

   Compare console output from:

   - dev server
   - local production build served locally
   - deployed production

   The goal is to identify the first field that differs between dev and
   deployed production.

5. Only then implement the fix.

   If the culprit is the typed-array conversion or upload, the likely fix is to
   replace the implicit conversion with an explicit normalized upload buffer:

   ```ts
   const headerWords = new Uint32Array(64);
   for (let i = 0; i < 64; i++) {
     headerWords[i] = headerBytes[i] ?? 0;
   }
   device.queue.writeBuffer(headerBuffer, 0, headerWords);
   ```

   But do not make that behavior change until the comparison logs identify the
   failing field.

### Expected Result

This experiment should explain why production sees an all-zero WGSL header while
development does not. The desired output is a precise statement like:

- production `headerUint32Array` is already zero before `writeBuffer`
- production `writeBuffer` receives correct words but GPU readback is zero
- production GPU readback is correct but WGSL storage reads zeros
- production package boundary gives `Pow5_64b_Wgsl` a zeroed `FixedBuf`

Once that is known, the next experiment can make the smallest fix with high
confidence.

### Non-Goals

- Do not fix the upload path yet.
- Do not change the shader representation yet.
- Do not change PoW difficulty or login behavior.
- Do not remove the current diagnostics until production login works.

### Result: Implemented, Pending Production Verification

Implemented the diagnostic-only header upload comparison. `headerBuffer` now
includes `GPUBufferUsage.COPY_SRC` so `debugReadHeader()` can perform a valid
GPU readback. The existing upload behavior is intentionally unchanged: the code
still constructs `headerUint32Array` with `new Uint32Array(headerUint8Array)`
and still writes `headerUint32Array.buffer`.

`Pow5_64b_Wgsl.init()` and `setInput()` now log `[keypears pow] header upload
init` and `[keypears pow] header upload setInput` with the byte-array shape,
derived `Uint32Array` shape, first bytes, first words, and all-zero checks.

Production should now show whether the first divergence is in the incoming
`FixedBuf`, the `Uint32Array` conversion, `queue.writeBuffer`, GPU buffer
readback, or WGSL storage reads.

## Experiment 9: Port the EBX Chrome WGSL Fix

### Hypothesis

The production-only KeyPears PoW failure is the same class of bug fixed in EBX
issue 44: newer Chrome/Chromium changed WebGPU behavior enough to expose a
fragile WGSL pointer/local-array path in the 32-byte BLAKE3 helper.

In EBX, the failure initially looked like a Playwright/Chromium or WebGPU
readback problem. Detailed probes ruled out JavaScript buffer upload, command
submission, and result readback. The actual failing code was
`blake3_hash_32`, specifically this pattern:

```wgsl
fn blake3_hash_32(
    input_ptr: ptr<function, array<u32, 32>>,
) -> array<u32, 32> {
    ...
    words_from_little_endian_bytes(&block, &block_words);
    ...
}
```

Newer Chrome could behave as if that pointer-based conversion consumed a zero or
stale block. EBX fixed it by making `blake3_hash_32` take the 32-byte array by
value and inline the little-endian word conversion. Callers changed from
`blake3_hash_32(&value)` to `blake3_hash_32(value)`.

KeyPears has the same WGSL pattern in both:

- `packages/pow5-ts/src/pow5-64b.wgsl`
- `packages/pow5-ts/src/pow5-217a.wgsl`

The current KeyPears production evidence matches the EBX failure class:

- JavaScript receives the real challenge header.
- WASM hashes the real challenge header.
- WGSL returns the known all-zero-header matmul and elementary-iteration test
  vectors in latest Chrome.
- Development has been tested with an older Chromium, which can mask this
  browser/runtime-specific WGSL behavior.

### Rationale

Experiment 8 was designed to prove the JavaScript-to-GPU upload boundary before
making a fix. The EBX investigation changes the risk calculation. We now have a
known prior incident in a sibling Pow5 implementation where the same newer
Chrome/WebGPU generation exposed the same style of silent WGSL wrong-result
behavior. EBX already did the deeper work of separating test harness issues,
headless/headed Playwright behavior, JavaScript upload, readback ordering, and
WGSL execution. The final EBX fix was small and production-code-local: rewrite
the 32-byte BLAKE3 WGSL helper to avoid pointer-based local array conversion.

Continuing to chase upload diagnostics first is likely to waste time because
the production symptom can be explained by `blake3_hash_32` returning stale or
zero-derived data inside the shader. The KeyPears `matmul_work` loop calls
`blake3_hash_32` repeatedly, and `elementary_iteration` calls it for the final
hashes. A wrong `blake3_hash_32` is enough to make the whole GPU miner produce
deterministic but wrong outputs while WASM remains correct.

At the same time, the recent diagnostics are still valuable. The user can test
the fixed build in both old and new browsers; if the fix works, the logs provide
confirmation. If the fix does not work, the logs still help identify the
remaining failure without reintroducing broad diagnostic code.

### Plan

1. Undo non-log diagnostic code that is not strictly necessary for this
   experiment.

   Remove code changes whose only purpose was active GPU probing/readback rather
   than logging:

   - `debug_header_prefix` WGSL entry point
   - `debugHeaderPrefix()` TypeScript method
   - `debugReadHeader()` TypeScript method
   - `GPUBufferUsage.COPY_SRC` added only for `debugReadHeader()`
   - pow5 browser test that only verifies `debugReadHeader()`
   - `POW5_64B_WGSL_LENGTH` export if it is only used by removed readback/probe
     diagnostics

   Keep deploy/build SHA plumbing if already useful for production diagnostics.

2. Preserve debug logs that are useful now or later.

   Keep logs that do not change GPU behavior:

   - build fingerprint
   - browser/origin/WebGPU context
   - raw challenge shape and field types
   - WebGPU adapter/device info
   - `device.lost`
   - header upload shape logs from Experiment 8
   - WASM/GPU stage comparisons where they use existing production debug
     methods
   - minimum-difficulty smoke test and batch/overrun logs

   Remove references to removed readback/probe methods from the miner logs.

3. Port the EBX WGSL fix into `pow5-64b.wgsl`.

   Change:

   ```wgsl
   fn blake3_hash_32(
       input_ptr: ptr<function, array<u32, 32>>,
   ) -> array<u32, 32>
   ```

   to:

   ```wgsl
   fn blake3_hash_32(input: array<u32, 32>) -> array<u32, 32>
   ```

   Inline the little-endian word conversion for the fixed 32-byte block:

   ```wgsl
   var block: array<u32, 64>;
   for (var i: u32 = 0u; i < 32u; i++) {
       block[i] = input[i];
   }

   var block_words: array<u32, 16>;
   for (var i: u32 = 0u; i < 16u; i++) {
       block_words[i] =
           block[i * 4u] |
           (block[i * 4u + 1u] << 8u) |
           (block[i * 4u + 2u] << 16u) |
           (block[i * 4u + 3u] << 24u);
   }
   ```

   Use `block_len = 32u` and `flags = CHUNK_START | CHUNK_END`, matching the EBX
   fix.

4. Update every `pow5-64b.wgsl` caller.

   Replace:

   ```wgsl
   blake3_hash_32(&value)
   ```

   with:

   ```wgsl
   blake3_hash_32(value)
   ```

5. Apply the same fix to `pow5-217a.wgsl`.

   Even though the current KeyPears webapp uses the 64-byte PoW path, the package
   still ships the 217-byte implementation. Leaving the known Chrome-sensitive
   pattern in one WGSL file creates a future regression. Apply the same
   `blake3_hash_32` rewrite and caller updates there for consistency.

6. Verify locally.

   Run:

   ```bash
   bun run --cwd packages/pow5-ts typecheck
   bun run --cwd webapp typecheck
   bun run --cwd webapp test
   bun run --cwd webapp build
   ```

   If Playwright Chromium is available locally, also run:

   ```bash
   bun run --cwd packages/pow5-ts test
   ```

7. Manual browser verification.

   The user will test development in:

   - the old Chromium version that previously worked
   - the latest Chrome version that currently fails in production

   If both work in development, deploy and test production.

### Expected Result

The WGSL GPU self-check should match WASM in old Chromium and latest Chrome.
The production miner should no longer return the all-zero-header matmul and
elementary-iteration test vectors for non-zero challenge headers.

If this fix works, the production failure is confirmed as the same Chrome/WGSL
portability issue EBX already fixed. If it does not work, the preserved logs
should still show whether the failure remains in `blake3_hash_32`, upload
conversion, GPU buffer state, or another WGSL stage.

### Non-Goals

- Do not rewrite the PoW algorithm.
- Do not change difficulty, challenge creation, login submission, or server
  verification.
- Do not remove all diagnostics yet; keep useful logs until production login is
  confirmed working.
- Do not keep active readback/probe code that is not needed for the EBX fix.

### Result: Implemented, Pending Browser Verification

The active Experiment 8 readback/probe code was removed:

- `debug_header_prefix` was removed from `pow5-64b.wgsl`.
- `debugHeaderPrefix()` and `debugReadHeader()` were removed from the WGSL
  wrapper.
- The header buffer no longer has `GPUBufferUsage.COPY_SRC` solely for
  readback.
- The readback-only browser test was removed.
- The temporary `POW5_64B_WGSL_LENGTH` export/import and miner log field were
  removed.

The passive diagnostics remain:

- build fingerprint, browser context, challenge shape, adapter/device info, and
  `device.lost`
- header upload shape logs
- header input hash log
- WASM/GPU stage comparison, self-check, minimum-difficulty smoke test, and
  mining overrun diagnostics

The EBX Chrome/WebGPU fix was ported to both WGSL files. `blake3_hash_32` now
takes `array<u32, 32>` by value and performs the fixed 32-byte little-endian
word conversion inline instead of taking a function pointer and routing through
`words_from_little_endian_bytes`. All `blake3_hash_32(&value)` call sites were
updated to pass by value.

Verification is local first, then browser/manual:

```bash
bun run --cwd packages/pow5-ts typecheck
bun run --cwd webapp typecheck
bun run --cwd webapp test
bun run --cwd webapp build
```

These checks pass. `bun run --cwd packages/pow5-ts test` is still blocked in
this local environment because Playwright's Chrome for Testing binary is not
installed at the expected cache path.

The remaining question is browser behavior. The next evidence comes from
testing the development app in both the old Chromium version and current Chrome,
then production after deploy if both pass.
