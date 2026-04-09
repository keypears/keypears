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

## Experiments

### Experiment 1: Fix all architecture issues

#### Description

Address all six findings in a single experiment. Each is an independent
refactor that doesn't change behavior.

#### Changes

**1. Extract shared utilities.**

Create `webapp/src/server/utils.ts`:

```ts
export function newId(): string { return uuidv7(); }
export function hashToken(token: string): string { ... }
```

Create `webapp/src/server/session.ts`:

```ts
export async function getSessionUserId(): Promise<string | null> { ... }
export async function requireSessionUserId(): Promise<string> { ... }
```

Remove `newId()` from `user.server.ts`, `message.server.ts`,
`federation.server.ts`. Remove `hashToken()` from `api.router.ts`,
`federation.server.ts`. Remove `getSessionUserId` /
`requireSessionUserId` from `user.functions.ts`, `message.functions.ts`.
All import from the new shared modules.

**2. Move `verifyDomainAdmin` to `federation.server.ts`.**

Move the function from `user.server.ts` to `federation.server.ts`. It
already calls `fetchKeypearsJson` which lives there. This eliminates the
dynamic `await import("./federation.server")` and
`await import("~/lib/config")` in `user.server.ts`.

Also move `getPrimaryDomain` out of `user.server.ts` — it dynamically
imports `getDomain` from config. Instead, have the caller pass the domain
name or use a direct import (no circular dep risk since config has no
server imports).

**3. Split large handler functions.**

In `message.functions.ts`, extract from `sendMessage`:

```ts
async function sendLocalMessage(senderUser, senderAddress, input) { ... }
async function sendRemoteMessage(senderUser, senderAddress, input) { ... }
```

In `api.router.ts`, extract from `notifyMessage`:

```ts
async function handleNotifyMessage(input) {
  const recipient = await resolveRecipient(input);
  await validateMessagePow(input);
  const message = await pullFromSender(input);
  await storeReceivedMessage(recipient, message);
}
```

**4. Move `safeFetch` to `webapp/src/server/fetch.ts`.**

Move `safeFetch`, `isBlockedIp`, and `BLOCKED_IP_RANGES` from
`lib/config.ts` to `server/fetch.ts`. Update imports in
`federation.server.ts` (the only consumer).

**5. Add visibility detection to polling.**

In `channel.$address.tsx` and `lib/channel-context.tsx`, wrap the polling
loops with a visibility check:

```ts
function useVisibility() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  return visible;
}
```

Polling pauses when `visible` is false and resumes when it becomes true.

**6. Extract `blake3Pbkdf` to `lib/kdf.ts`.**

Create `webapp/src/lib/kdf.ts` with only `@webbuf/blake3` imports:

```ts
export function blake3Pbkdf(password, salt, rounds) { ... }
```

Remove from `lib/auth.ts` and `server/user.server.ts`. Both import from
`lib/kdf.ts`.

#### Verification

1. All tests pass.
2. Lint clean.
3. `grep -r "function newId" webapp/src/` returns only `server/utils.ts`.
4. `grep -r "function hashToken" webapp/src/` returns only
   `server/utils.ts`.
5. `grep -r "getSessionUserId" webapp/src/` returns only
   `server/session.ts` (definition) + consumers (imports).
6. `grep -r "blake3Pbkdf" webapp/src/` returns only `lib/kdf.ts`
   (definition) + consumers (imports).
7. No dynamic `await import()` in `user.server.ts`.
8. `safeFetch` not in `lib/config.ts`.
9. All functionality works: create account, login, send messages,
   federation, domain claiming, key rotation, password change.
10. Open a channel, switch tabs, check network — no polling requests while
    tab is hidden. Switch back — polling resumes.
