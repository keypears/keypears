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
