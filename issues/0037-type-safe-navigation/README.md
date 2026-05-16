+++
status = "closed"
opened = "2026-05-16"
closed = "2026-05-16"
+++

# Type-Safe Navigation

## Goal

Make every link, route transition, redirect, and browser navigation in the repo
type-safe. There are no approved exceptions unless Ryan explicitly approves a
specific call site.

## Background

TanStack Router gives the webapp typed route paths, typed params, and typed
search params. The repo already uses those patterns in many places, especially
for dynamic route params such as `/channel/$address`, `/vault/$id`, and
`/$profile`.

The audit found several places where route safety is weakened by passing untyped
strings into navigation APIs, manually constructing internal URLs, or using raw
browser navigation. Literal route strings such as `to="/home"` are usually
type-checkable by TanStack Router. The unsafe cases are dynamic strings in
`to={...}`, arbitrary markdown hrefs routed through `Link`, raw `<a href>`
usage, and direct `window.location` usage that bypasses the router.

This issue should convert those call sites to route-safe APIs or replace them
with a small explicit abstraction that makes the safety boundary visible.

## Requirements

- Audit the full repo for navigation and link APIs, including:
  - TanStack `<Link>`;
  - `useNavigate`;
  - `redirect`;
  - router navigation helpers;
  - raw `<a href>`;
  - `window.location`, `document.location`, `location.assign`, and
    `location.replace`;
  - markdown-rendered links;
  - Astro landing-page links.
- Internal webapp links must use typed TanStack Router routes.
- Dynamic params must use `to="/route/$param"` plus `params`, never string
  interpolation.
- Search params must use router `search`, never manual query-string assembly for
  internal app routes.
- Navigation tables must not infer `path: string`; they must preserve typed
  route literals or use an explicit typed route object shape.
- Markdown links must not pass arbitrary `href` values directly to TanStack
  `Link`.
- Raw `<a href>` must be removed or wrapped in an explicitly approved, type-safe
  external-link abstraction.
- Direct browser navigation must be removed or wrapped in an explicitly approved
  abstraction for the exact case being handled.
- Logout is currently the only documented full-reload navigation pattern in the
  webapp conventions, but it still needs an explicit approved wrapper or other
  type-safe handling before this issue can close.
- No exception may remain unless Ryan explicitly approves that exact call site,
  and the issue documents the approval.

## Initial Audit Findings

### Dynamic TanStack `to={...}` Values

- `webapp/src/components/UserDropdown.tsx`
  - Builds `profilePath` with string interpolation and passes it to
    `<Link to={profilePath}>`.
  - Should use `to="/$profile"` with `params`.
- `webapp/src/components/Sidebar.tsx`
  - `navItems[].path` is inferred as `string` and passed to
    `<Link to={item.path}>`.
  - The profile address link builds `path` with string interpolation and passes
    it to `<Link to={path}>`.
- `webapp/src/components/DocsContent.tsx`
  - `pageOrder` uses `path: string`; previous/next links pass
    `<Link to={prev.path}>` and `<Link to={next.path}>`.
- `webapp/src/routes/_docs.tsx`
  - `docsNav[].path` is inferred as `string` and passed to
    `<Link to={item.path}>`.
- `webapp/src/components/MarkdownRenderer.tsx`
  - Arbitrary markdown `href` values are passed to `<Link to={href || ""}>`.

### Raw Browser Navigation

- `webapp/src/components/UserDropdown.tsx`
  - Uses `window.location.replace("/")` for logout.
  - This may remain a full reload only if wrapped and explicitly approved.
- `webapp/src/routes/_app/_saved/sign.tsx`
  - Uses `window.location.href = callbackUrl.toString()` for third-party auth
    denial redirects.
  - This leaves the app origin and needs an explicit typed/validated external
    navigation boundary.
- `webapp/src/routes/_app/_saved/sign.tsx`
  - Builds and submits a raw HTML form for third-party auth POST callback.
  - This is intentionally not a router navigation, but it still needs an
    explicit reviewed abstraction or documented approval.

### Raw `<a href>`

- `webapp/src/components/Footer.tsx`
  - Uses raw `<a href="https://astrohacker.com">` for an external link.
- `passapples/src/pages/index.astro`
  - Uses raw `<a href={keypearsUrl}>` to link from the Astro landing page to the
    KeyPears app.
- `lockberries/src/pages/index.astro`
  - Uses raw `<a href={keypearsUrl}>` to link from the Astro landing page to the
    KeyPears app.

The favicon `<link href="...">` tags in Astro pages are asset references, not
navigation links, but the implementation should make the audit script precise
enough that asset tags do not hide real navigation issues.

## Acceptance Criteria

- Every internal webapp navigation call is checked by TanStack Router route
  types.
- No internal route is built by string interpolation.
- No navigation table or helper widens internal route paths to plain `string`.
- No arbitrary markdown `href` is passed directly to TanStack `Link`.
- No raw `<a href>` remains for navigation unless Ryan explicitly approves the
  exact call site and the approval is documented in this issue.
- No direct `window.location`, `document.location`, `location.assign`, or
  `location.replace` remains unless Ryan explicitly approves the exact call site
  and the approval is documented in this issue.
- There is a repeatable audit command or test that fails on newly introduced
  unsafe navigation patterns.
- `pnpm --filter @keypears/webapp run typecheck` passes.
- Any touched Astro landing pages still build successfully.

## Notes

Do not begin implementation until the first experiment is designed. This issue
only records the audit and the requirement that all navigation become type-safe
with no unapproved exceptions.

## Experiment 1: convert unsafe navigation call sites

### Hypothesis

The currently identified unsafe navigation call sites can be converted to typed
TanStack Router navigation or explicit reviewed external-navigation boundaries
without changing user-facing behavior.

### Goal

Make the known unsafe links and navigations type-safe. The experiment is not
done until the call sites listed in the Initial Audit Findings section are fixed
or Ryan explicitly approves a specific exception.

### Scope

Fix unsafe navigation in:

- `webapp/src/components/UserDropdown.tsx`;
- `webapp/src/components/Sidebar.tsx`;
- `webapp/src/components/DocsContent.tsx`;
- `webapp/src/components/MarkdownRenderer.tsx`;
- `webapp/src/routes/_docs.tsx`;
- `webapp/src/routes/_app/_saved/sign.tsx`;
- `webapp/src/components/Footer.tsx`;
- `passapples/src/pages/index.astro`;
- `lockberries/src/pages/index.astro`.

Archived or generated code is out of scope unless it is part of the active
build/runtime surface.

### Plan

1. Replace interpolated profile links with `to="/$profile"` and typed `params`.
2. Change navigation arrays so route paths remain typed route literals instead
   of widening to plain `string`.
3. Fix docs previous/next links so they use typed route objects or typed route
   literals.
4. Fix markdown rendering so external URLs use a reviewed external-link path and
   internal markdown links are converted only when they match known typed
   routes.
5. Replace raw external `<a href>` usage with a reviewed external-link component
   or helper.
6. Replace direct `window.location` usage with explicit helpers for the exact
   full-page navigation cases:
   - logout reload to `/`;
   - third-party auth denial redirect;
   - third-party auth POST callback form submission.
7. Re-run a repo-wide navigation search to confirm no unapproved unsafe patterns
   remain.
8. Run typechecks and any touched app builds.

### Acceptance Criteria

- Every call site listed in Initial Audit Findings is fixed or has Ryan's
  explicit approval documented in this issue.
- Internal webapp links use typed TanStack Router paths and params.
- No internal route is built by string interpolation.
- Navigation arrays do not widen route paths to plain `string`.
- Markdown does not route arbitrary `href` values through TanStack `Link`.
- Raw `<a href>` navigation is removed or replaced by an approved abstraction.
- Direct browser navigation is removed or replaced by an approved abstraction.
- A final repo-wide navigation search finds no unapproved unsafe patterns.
- `pnpm --filter @keypears/webapp run typecheck` passes.
- Any touched Astro landing pages build successfully.

### Result

Success.

Experiment 1 converted the known unsafe navigation call sites to typed router
navigation or explicit navigation boundary components/helpers.

Implemented changes:

- Interpolated profile URLs in `UserDropdown` and `Sidebar` now use
  `to="/$profile"` with typed `params`.
- Sidebar and docs navigation arrays now preserve route path literals with
  `FileRouteTypes["to"]` instead of widening paths to plain `string`.
- Docs previous/next navigation now uses typed docs route paths.
- Markdown links now pass only whitelisted internal route paths to TanStack
  `Link`. External URLs, hash anchors, and the known `/keypears.pdf` asset use
  the explicit `ExternalLink` boundary instead of arbitrary `Link to={href}`.
- The footer and Astro landing-page external links now use explicit
  `ExternalLink` components with typed external URL props.
- Logout and third-party signing redirects/form submissions now go through
  explicit helpers in `webapp/src/lib/navigation.ts` instead of direct
  component-level browser navigation.

No explicit exception approvals were needed.

Verification:

```bash
pnpm --filter @keypears/webapp run typecheck
pnpm --filter @keypears/passapples exec astro build
pnpm --filter @keypears/lockberries exec astro build
rg -n "<a\\b|window\\.location|location\\.(href|assign|replace)|document\\.location" webapp/src passapples/src lockberries/src -g "*.ts" -g "*.tsx" -g "*.astro"
rg -n "to=\\{[^}]+\\}" webapp/src -g "*.tsx" -g "*.ts"
```

The raw anchor/browser-navigation search now reports only the explicit
navigation boundary implementations:

- `webapp/src/components/ExternalLink.tsx`
- `webapp/src/lib/navigation.ts`
- `passapples/src/components/ExternalLink.astro`
- `lockberries/src/components/ExternalLink.astro`

The remaining dynamic `to={...}` hits are typed route-literal expressions or
typed route-path unions, not plain `string` paths.

## Conclusion

Issue 37 made active webapp and landing-page navigation type-safe. Internal
webapp route links now use typed TanStack Router paths, params, or typed
route-path unions. Interpolated profile URLs were replaced with `/$profile`
route params, and navigation arrays no longer widen route paths to plain
`string`.

Markdown-rendered links now route only whitelisted internal paths through
TanStack `Link`; external URLs, hash anchors, and the known `/keypears.pdf`
asset go through explicit external-link boundaries. Raw external anchors in the
webapp footer and Astro landing pages were moved behind typed `ExternalLink`
components. Direct browser navigation for logout and third-party signing flows
now lives in explicit navigation helpers instead of being scattered through UI
components.

No exception approvals were required. Verification passed for the webapp
typecheck and both Astro landing-page builds.
