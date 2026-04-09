+++
status = "open"
opened = "2026-04-09"
+++

# Issue 10: Architecture Cleanup

## Goal

Clean up code duplication, misplaced modules, oversized functions, and minor
structural issues found in the pre-launch architecture audit.

## Background

A software architecture audit found the codebase well-structured overall but
identified several areas of code duplication, circular dependency workarounds,
and functions doing too many things. None are bugs — they're maintainability and
clarity improvements.

### Findings

**1. Code duplication (HIGH).**

- `newId()` defined in 3 files: `user.server.ts`, `message.server.ts`,
  `federation.server.ts`.
- `hashToken()` defined in 2 files: `api.router.ts`, `federation.server.ts`.
- `getSessionUserId()` and `requireSessionUserId()` defined in 2 files:
  `user.functions.ts`, `message.functions.ts`.

Fix: extract to shared utility modules.

**2. Dynamic imports to avoid circular deps (HIGH).**

`user.server.ts` dynamically imports from `config.ts` and `federation.server.ts`
inside `verifyDomainAdmin` and `getPrimaryDomain`. This is a workaround for
circular dependencies.

Fix: move `verifyDomainAdmin` to `federation.server.ts` where it belongs (it
fetches `keypears.json` — that's federation logic). This eliminates the circular
dependency and the dynamic imports.

**3. Large handler functions (MEDIUM).**

`sendMessage` in `message.functions.ts` (~90 lines) handles both local and
remote delivery. `notifyMessage` in `api.router.ts` (~80 lines) does recipient
validation, PoW verification, message pulling, and storage.

Fix: split into focused helper functions.

**4. `safeFetch` in wrong module (MEDIUM).**

`safeFetch()` is server-only SSRF protection code living in `lib/config.ts`,
which is conceptually a config/address utility module.

Fix: move to `src/server/fetch.ts`.

**5. Polling ignores tab visibility (MEDIUM).**

The channel page and channel context poll every 200ms/5s even when the browser
tab is hidden. This wastes bandwidth and battery.

Fix: pause polling when `document.hidden` is true, resume on visibility change.

**6. `blake3Pbkdf` duplicated across client/server (MEDIUM).**

The identical `blake3Pbkdf` function exists in both `lib/auth.ts` (client)
and `server/user.server.ts` (server). They can't import from each other due
to the client/server boundary, but the function is pure crypto with no
server dependencies.

Fix: extract to `lib/kdf.ts` (pure `@webbuf/blake3` imports only). Both
client and server import from it.

### Not issues

- Lazy cleanup on every request — one indexed DELETE per request is fast. No
  background worker needed at this scale.
- `_chrome` route naming — TanStack Router convention. Not worth renaming.
- Three.js dependency — may be unused. Should verify and remove if so, but not
  an architecture issue.
