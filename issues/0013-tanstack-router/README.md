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
