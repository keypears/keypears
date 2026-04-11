+++
status = "open"
opened = "2026-04-11"
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
