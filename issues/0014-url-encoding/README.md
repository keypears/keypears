+++
status = "closed"
opened = "2026-04-11"
closed = "2026-04-11"
+++

# URL Param Encoding

## Goal

Fix TanStack Router's over-encoding of route params so that valid URL characters
like `@` appear literally in the URL, not as `%40`. Create a reusable solution
that works everywhere.

## Background

TanStack Router encodes route params with `encodeURIComponent`, which converts
`@` to `%40`. This produces ugly URLs:

```
https://keypears.test/channel/bob%40passapples.test   ← current (broken)
https://keypears.test/channel/bob@passapples.test     ← desired
```

`@` is valid in URL path segments per RFC 3986. The router is being overly
aggressive.

### Affected routes

- `/channel/$address` — KeyPears addresses contain `@`
- `/$profile` — profile URLs are KeyPears addresses with `@`
- `/vault/$id` — UUIDs, no `@`, but should use the same pattern for consistency

### Affected Link/navigate calls

Every `<Link>` or `navigate()` that passes `params` with an address:

- `inbox.tsx` — channel links
- `home.tsx` — profile link
- `send.tsx` — navigate to channel after send
- `$profile.tsx` — message button with search param
- `channel.$address.tsx` — channel sidebar links
- `vault.$id.tsx` — vault entry links

## Solution

Create a shared `params` config that routes use to opt out of TanStack Router's
default encoding. TanStack Router supports `params.stringify` and `params.parse`
on route definitions.

### Shared helper — `webapp/src/lib/route-params.ts`

```typescript
/**
 * TanStack Router param config that preserves literal characters in URLs.
 * Use on any route with params that contain @ or other valid URL characters.
 */
export const addressParam = {
  stringify: ({ address }: { address: string }) => ({ address }),
  parse: ({ address }: { address: string }) => ({ address }),
};

export const profileParam = {
  stringify: ({ profile }: { profile: string }) => ({ profile }),
  parse: ({ profile }: { profile: string }) => ({ profile }),
};

export const idParam = {
  stringify: ({ id }: { id: string }) => ({ id }),
  parse: ({ id }: { id: string }) => ({ id }),
};
```

Each route applies the appropriate config:

```typescript
export const Route = createFileRoute("/_app/_saved/channel/$address")({
  params: addressParam,
  // ...
});
```

### CLAUDE.md update

Document the rule: all routes with dynamic params MUST use the shared param
config from `route-params.ts` to prevent over-encoding. New routes with new
param names add a new helper to the file.

## Experiments

### Experiment 1: Shared param config

#### Description

Create `route-params.ts` with reusable param configs. Apply to all three
parameterized routes. Update CLAUDE.md.

#### Changes

1. **Create `webapp/src/lib/route-params.ts`** — export `addressParam`,
   `profileParam`, `idParam`. Each has `stringify` and `parse` that pass
   through the param value without encoding.

2. **`channel.$address.tsx`** — add `params: addressParam` to route config.

3. **`$profile.tsx`** — add `params: profileParam` to route config.

4. **`vault.$id.tsx`** — add `params: idParam` to route config.

5. **CLAUDE.md** — add rule: all routes with dynamic params must use shared
   param config from `route-params.ts`.

#### Verification

1. Navigate to `/channel/bob@passapples.test` — URL shows `@` not `%40`
2. Navigate to `/bob@keypears.test` — profile URL shows `@` not `%40`
3. Navigate to `/vault/<uuid>` — still works
4. Click `<Link>` to channel from inbox — URL correct
5. Click `<Link>` to profile from home — URL correct
6. `bun run lint` — clean
7. `bun run build` — passes

#### Result: Pass

The initial approach — per-route `params.stringify`/`params.parse` configs in a
shared `route-params.ts` — was wrong. Those configs control how params are
parsed from the URL on the route definition side, not how `<Link>` encodes
params when building URLs. The `@` was still encoded as `%40` in every link.

The correct solution is one line in `router.tsx`:

```typescript
pathParamsAllowedCharacters: ["@"]
```

This tells TanStack Router globally to not encode `@` in any route param URL.
It works at the URL construction level — both `<Link>` and `navigate()` produce
clean URLs. The per-route configs were removed, `route-params.ts` deleted.

## Conclusion

TanStack Router encodes route params with `encodeURIComponent` by default,
converting `@` to `%40`. The fix is `pathParamsAllowedCharacters: ["@"]` on the
router config — one line, global, applies to all routes and all `<Link>`/
`navigate()` calls. No per-route configuration needed. If other characters need
preserving in the future, add them to the array.
