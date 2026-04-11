+++
status = "open"
opened = "2026-04-11"
+++

# TanStack Router Best Practices

## Goal

Audit the app against TanStack Router and TanStack Start best practices and fix
all violations.

## Background

The app recently migrated all `<a href>` and `window.location.href` to `<Link>`
and `useNavigate`. A subsequent audit and internet research revealed additional
gaps. This issue tracks everything that needs fixing.

### Sources

- [Swizec Teller — "Tips from 8 months of TanStack Router in production"](https://swizec.com/blog/tips-from-8-months-of-tan-stack-router-in-production/)
- [DEV — Route guards with beforeLoad](https://dev.to/this-is-learning/tanstack-router-how-to-protect-routes-with-an-authentication-guard-1laj)
- [DEV — Auth middleware for server functions](https://dev.to/hirotoshioi/how-to-protect-server-functions-with-auth-middleware-in-tanstack-start-opj)
- [TanStack Router — Data Loading](https://tanstack.com/router/latest/docs/guide/data-loading)
- [TanStack Router — Search Params](https://tanstack.com/router/latest/docs/guide/search-params)
- [TanStack Router — Authenticated Routes](https://tanstack.com/router/v1/docs/guide/authenticated-routes)
- [TanStack Router — Data Mutations](https://tanstack.com/router/v1/docs/guide/data-mutations)
- [TanStack Router — Not Found Errors](https://tanstack.com/router/latest/docs/guide/not-found-errors)
- [TanStack Router — Preloading](https://tanstack.com/router/latest/docs/guide/preloading)
- [TanStack Router — Code Splitting](https://tanstack.com/router/latest/docs/guide/code-splitting)
- [TanStack Start — Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [TanStack Start — Code Execution Patterns](https://tanstack.com/start/latest/docs/framework/react/guide/code-execution-patterns)
- [TanStack Start — Middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)

## What we're already doing right

- **Two-file pattern** (`.functions.ts` / `.server.ts`) — exactly what TanStack
  Start recommends. Static imports are safe; the build replaces server function
  bodies with RPC stubs in client bundles.
- **`validateSearch`** on the send page for the `to` query param.
- **`notFound()`** thrown from profile loader for missing users.
- **`ssr: false`** on auth-required routes (`_app.tsx`, `index.tsx`,
  `login.tsx`).
- **Loaders** for page-critical data, `useEffect` for polling and debounced
  searches.
- **`<Link>` and `useNavigate`** for all internal navigation (just migrated).

## Findings — what needs fixing

### 1. String interpolation in navigate (High)

`send.tsx:166` uses string interpolation instead of typed params:

```typescript
// Current:
navigate({ to: `/channel/${pending.recipientAddress}` });

// Should be:
navigate({
  to: "/channel/$address",
  params: { address: pending.recipientAddress },
});
```

This bypasses type safety — a renamed route param would silently break at
runtime instead of failing at build time.

Source: [TanStack Router typed routes](https://tanstack.com/router/latest/docs/guide/data-loading)

### 2. No error or pending components (High)

No route defines `errorComponent` or `pendingComponent`. If a loader throws,
there's no fallback UI.

**Fix**: Define `defaultErrorComponent` and `defaultPendingComponent` at the
router level in `__root.tsx` or the router config. These serve as global
fallbacks. Individual routes can override with their own components.

Be aware: `pendingComponent` only triggers during `loader` execution, NOT
during `beforeLoad`. If `beforeLoad` is slow, users see nothing.

Source: [TanStack Router — Not Found Errors](https://tanstack.com/router/latest/docs/guide/not-found-errors),
[GitHub #1104](https://github.com/TanStack/router/issues/1104)

### 3. No route preloading (Medium)

The router doesn't set `defaultPreload: 'intent'`, so hovering over `<Link>`
components doesn't preload the target route's data. This is free performance —
hover triggers a preload with 50ms delay, data expires after 30s.

**Fix**: Add `defaultPreload: 'intent'` to the router config.

Be conservative with `'viewport'` or `'render'` strategies on mobile networks.

Source: [TanStack Router — Preloading](https://tanstack.com/router/latest/docs/guide/preloading)

### 4. Manual refetching instead of router.invalidate() (Medium)

After mutations (editing vault entries, sending messages), the app manually
refetches data or reloads the page. TanStack Router provides
`router.invalidate()` which reloads all current route matches in the
background — existing data stays visible while fresh data loads.

**Fix**: Replace manual refetch patterns with `router.invalidate()`. Use
`{ sync: true }` when the UI must wait for fresh data.

Source: [TanStack Router — Data Mutations](https://tanstack.com/router/v1/docs/guide/data-mutations)

### 5. Auth middleware for server functions (Medium)

Every server function handler repeats `requireSessionUserId()`. TanStack Start
supports `createMiddleware` — define an `authMiddleware` once and apply it with
`.middleware([authMiddleware])` on any protected server function. The session is
passed through `next()` context for type-safe access.

**Fix**: Create `src/server/auth-middleware.ts` with a shared middleware that
extracts and validates the session. Apply to all protected server functions.

Source: [TanStack Start — Middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware),
[DEV — Auth middleware](https://dev.to/hirotoshioi/how-to-protect-server-functions-with-auth-middleware-in-tanstack-start-opj)

### 6. Search param validation resilience (Low)

`send.tsx` uses basic type checking for search params:

```typescript
validateSearch: (search: Record<string, unknown>) => ({
  to: typeof search.to === "string" ? search.to : "",
})
```

The official recommendation is to use Zod with `.catch()` over `.default()` for
malformed params — avoids halting UX with error messages on bad URLs.

Source: [TanStack Router — Search Params](https://tanstack.com/router/latest/docs/guide/search-params)

### 7. ESLint disable without explanation (Low)

`send.tsx:49` disables `react-hooks/exhaustive-deps` without a comment
explaining why empty deps are safe.

### 8. Consider auto code splitting (Low)

Enable `autoCodeSplitting: true` in the Vite plugin config for zero-config
route-level code splitting. Alternatively, manually split heavy components
(PowModal, entry detail forms) into `.lazy.tsx` files using
`createLazyFileRoute`.

Critical route options (`loader`, `beforeLoad`, `validateSearch`) stay in the
main file. Non-critical options (`component`, `errorComponent`,
`pendingComponent`) can be lazy-loaded.

Source: [TanStack Router — Code Splitting](https://tanstack.com/router/latest/docs/guide/code-splitting)

### 9. Loaders are isomorphic — verify no secret leaks (Verify)

Route loaders execute in BOTH server and client environments. They are NOT
server-only. Never access secrets, database connections, or environment
variables directly in a loader — always delegate to `createServerFn`.

Our `_app.tsx` and `_saved.tsx` guards call server functions, so this is likely
fine. But verify no loader directly imports from `.server.ts` files.

Source: [TanStack Start — Code Execution Patterns](https://tanstack.com/start/latest/docs/framework/react/guide/code-execution-patterns)

## Additional notes from research

### Four-tier data strategy (Swizec)

1. **Router loaders** — page-critical data that blocks rendering
2. **Suspense queries** — data needed by a single component, can stream in
3. **Regular queries** — data that depends on user interaction
4. **Deferrable queries** — supplemental data (counts, previews)

Our app uses tiers 1 and 3 well. Tier 2 (Suspense) and tier 4 (deferred) are
not used but may not be needed at our scale.

### beforeLoad vs loader

`beforeLoad` runs before child routes' `beforeLoad` — it's middleware for the
subtree. Use it for auth guards, redirects, and context injection. Use `loader`
for data fetching. Our `_app.tsx` and `_saved.tsx` use loaders for auth checks
— these could arguably be `beforeLoad` with `redirect()` for a cleaner pattern
(no flash of protected content), but the current approach works.

### Testing

No official testing docs exist. Community uses fragmented approaches. If we add
tests for route behavior, set `defaultPendingMinMs: 0` in test router configs
to avoid artificial delays.

## Experiments

### Experiment 1: Quick fixes (#1 and #7)

#### Description

Fix the two trivial issues: string interpolation in navigate, and the missing
eslint-disable comment.

#### Changes

1. `send.tsx:166` — replace string interpolation with typed params:
   `navigate({ to: "/channel/$address", params: { address: ... } })`
2. `send.tsx:49` — add comment explaining why empty deps are safe.

#### Result: Pass

Both fixes applied. Lint clean, build passes.

### Experiment 2: Error/pending components (#2, #3)

#### Description

Add default error, pending, and not-found components to the router config.
Finding #3 (preloading) is already implemented — `defaultPreload: 'intent'` is
set in `router.tsx`.

#### Changes

**`webapp/src/router.tsx`** — add three default components:

- `defaultErrorComponent` — shows error message with a "Try again" button that
  calls `router.invalidate()`. Minimal styling, matches the app's design.
- `defaultPendingComponent` — centered spinner (Loader2 from lucide).
- `defaultNotFoundComponent` — "Page not found" with a link back to home.

These are global fallbacks. Individual routes can override them. The components
render inside the existing layout, so they inherit the app's styles.

#### Verification

1. `bun run build` — passes
2. `bun run lint` — clean
3. Manually trigger an error (e.g. navigate to a nonexistent vault entry) —
   error component renders
4. Navigate to `/nonexistent` — not found component renders

#### Result: Pass

Added `defaultErrorComponent` (with "Try again" via `router.invalidate()`),
`defaultPendingComponent` (Loader2 spinner), and `defaultNotFoundComponent`
("Page not found" with Link home) to `router.tsx`. Finding #3 was already
implemented. Lint clean, build passes.

### Experiment 3: Use router.invalidate() after mutations (#4)

#### Description

After mutations, the app manually calls server functions and updates local
state. TanStack Router provides `router.invalidate()` which re-runs all current
route loaders in the background — but it only works if the component reads
loader data directly instead of copying it into `useState`.

The fix has two parts: (1) stop copying loader data into state where
unnecessary, (2) call `router.invalidate()` after mutations.

#### Analysis

**`keys.tsx`** — copies `keys` and `passwordHash` into `useState`. The key list
is just loader data rendered — no search, no pagination, no client-side
filtering. No reason for state. After rotate or re-encrypt, manually calls
`getMyKeys()` and `setKeyList()`.

Fix: read `Route.useLoaderData()` directly. Remove `keyList`/`passwordHash`
state. After mutations, call `router.invalidate()`.

**`vault.tsx`** — copies `entries` into state. This state IS needed: the page
does search and pagination, which modify the list beyond what the loader
provides. `router.invalidate()` can't replace manual refetching here.

Fix: after creating an entry, navigate to the new entry's detail page
(`/vault/$id`) instead of refetching the list. The list refreshes naturally
when the user navigates back (loader re-runs).

**`vault.$id.tsx`** — copies `entries` into state for the sidebar. The
`onSaved` callback already navigates to the same entry, which re-runs the
loader and provides fresh data. But the sidebar entry list is in state, so it
goes stale.

Fix: same pattern as vault.tsx — sidebar entries are client-managed (search).
Keep the manual refetch for sidebar, but remove the redundant refetch from the
save flow since `onSaved` navigates and re-runs the loader for the main entry.

#### Changes

1. **`keys.tsx`**: Remove `keyList`/`passwordHash` state. Read
   `Route.useLoaderData()` directly in render. After rotate and re-encrypt,
   call `router.invalidate()` instead of `getMyKeys()` + `setKeyList()`.

2. **`vault.tsx`**: After create, navigate to the new entry's detail page
   (`/vault/$id`) instead of refetching the list.

3. **`vault.$id.tsx`**: In the save flow, `onSaved` navigates (re-runs loader).
   Keep `onUpdated` for the sidebar list refresh — it's client-managed state.

#### Verification

1. `bun run build` — passes
2. `bun run lint` — clean
3. Rotate a key on Keys page — list updates via invalidation
4. Re-encrypt a key — list updates via invalidation
5. Create a vault entry — navigates to detail page
6. Edit a vault entry — data refreshes after save
7. Delete a vault entry — navigates back to vault list

#### Result: Pass

- `keys.tsx`: removed `keyList`/`passwordHash` state, reads
  `Route.useLoaderData()` directly, uses `router.invalidate()` after rotate and
  re-encrypt.
- `vault.tsx`: after create, navigates to `/vault/$id` instead of refetching.
- `vault.$id.tsx`: removed redundant `onUpdated` from save flow — `onSaved`
  navigates and re-runs the loader. Removed `onUpdated` prop from
  `EntryDetail` entirely.
- Lint clean, build passes.

### Experiment 4: Auth middleware for server functions (#5)

#### Description

Replace repeated `requireSessionUserId()` calls with `createMiddleware`.

`createMiddleware` IS available in our installed version (1.167.16). It's
exported from `@tanstack/react-start`, implemented in
`@tanstack/start-client-core`. The API is RC-stable and documented.

Import: `import { createMiddleware } from '@tanstack/react-start'`

Two middleware types exist:
- **Request middleware** (default) — applies to all server requests
- **Server function middleware** (`{ type: 'function' }`) — supports input
  validation and client-side logic

For auth, we want server function middleware. It extracts the session and passes
the userId through `next()` context, making it type-safe in handlers.

Known issues to watch for:
- Server function middleware code leaking into client bundles
  ([#2783](https://github.com/TanStack/router/issues/2783))
- Typing issues where adding request middleware causes `data` to become `never`
  ([#5238](https://github.com/TanStack/router/issues/5238))

Sources:
- [Middleware Guide](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)
- [createMiddleware API](https://tanstack.com/start/latest/docs/framework/react/middleware)
- [Frontend Masters — Introducing TanStack Start Middleware](https://frontendmasters.com/blog/introducing-tanstack-start-middleware/)

#### Changes

1. Create `webapp/src/server/auth-middleware.ts` with an `authMiddleware` that
   extracts the session userId and passes it through context.
2. Update all server functions that call `requireSessionUserId()` to use
   `.middleware([authMiddleware])` and read userId from context instead.
3. Keep `getSessionUserId()` (nullable version) for functions that work with
   or without auth (e.g. `getMyChannels`, `getMyUser`).

#### Verification

1. `bun run build` — passes
2. `bun run lint` — clean
3. All authenticated flows still work (create account, login, send message,
   vault CRUD, key rotation, domain management)

#### Result: Pass

Created `auth-middleware.ts` with `authMiddleware` using `createMiddleware`.
Converted all `requireSessionUserId()` calls across three files:
- `vault.functions.ts` — 5 functions
- `message.functions.ts` — 6 functions (sendMessage, getMessagesForChannel,
  getOlderMessages, pollNewMessages, markChannelAsRead, getMyActiveEncryptedKey)
- `user.functions.ts` — 11 functions (saveMyUser, deleteMyUser, rotateKey,
  getMyEncryptedKeys, changeMyPassword, reEncryptMyKey, claimDomainFn,
  getDomainUsersFn, createDomainUserFn, resetDomainUserPasswordFn,
  toggleOpenRegistrationFn, toggleAllowThirdPartyDomainsFn, getMyPowSettings,
  updateMyPowSettings)

`getMyAddress` helper converted from calling `requireSessionUserId` to
accepting `userId` as parameter.

Functions using optional auth (`getSessionUserId`) left unchanged:
getMyChannels, getMyUnreadCount, getMyUser, checkNameAvailable, getMyDomains.

`requireSessionUserId` is now unused (only definition remains in session.ts).
Lint clean, build passes.
