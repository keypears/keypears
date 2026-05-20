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
imports will put those dependencies back into TypeScript's static graph and
make production bundling fail at build time instead of failing at login time.

### Plan

1. Replace browser PoW dynamic imports with static imports.
   - `FixedBuf` must be statically imported from `@webbuf/fixedbuf`.
   - `Pow5_64b_Wgsl` and `hashMeetsTarget` must be statically imported from
     the WASM-free `@keypears/pow5/wgsl` entry point.
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
   - Add a script or test that fails when application source contains
     `import(`.
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
