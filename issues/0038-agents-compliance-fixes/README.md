+++
status = "open"
opened = "2026-05-16"
+++

# Issue 38: AGENTS Compliance Fixes

## Goal

Fix every confirmed violation found in the AGENTS.md compliance audit so the
codebase follows the repository rules for navigation, server-function auth,
route state synchronization, and issue records.

## Background

The audit found that several rules added to AGENTS.md had not been fully applied
to older code. The violations are concentrated in TanStack navigation
boundaries, server functions that return authenticated user data, route state
that is initialized from loader or search data, and one historical closed issue
missing its required conclusion.

These rules are mandatory because they protect SPA behavior, endpoint security,
and the reliability of issue records.

## Confirmed Violations

### Non-logout full document navigation

`webapp/src/lib/navigation.ts` still exposes `leaveAppForExternalUrl()`, which
uses `window.location.href`. The only approved `window.location.href` in
AGENTS.md is logout.

Current user:

- `webapp/src/routes/_app/_saved/sign.tsx` calls `leaveAppForExternalUrl()` for
  third-party auth denial redirects.

This needs either a type-safe/TanStack-compatible alternative or explicit
approval for a narrow non-logout exception. No exception should remain implicit.

### Protected server functions without auth middleware

The following server functions return authenticated user data but call
`getSessionUserId()` directly instead of using `.middleware([authMiddleware])`
and `context.userId`:

- `webapp/src/server/message.functions.ts` — `getMyChannels`
- `webapp/src/server/message.functions.ts` — `getMyUnreadCount`
- `webapp/src/server/user.functions.ts` — `getMyKeys`
- `webapp/src/server/user.functions.ts` — `getMyDomains`

AGENTS.md states that TanStack Start server functions are exposed as HTTP
endpoints and route guards do not protect them. Any function that should only be
callable by authenticated users must use the auth middleware.

### Loader-derived state without complete sync

`webapp/src/routes/_app/_saved/_chrome/domains.tsx` syncs `domainList` from
loader data, but also initializes these values from loader-derived data without
syncing them when the loader re-runs:

- `apiDomainInput` from `data.apiDomain`
- `adminInput` from `myAddress`

`webapp/src/routes/_app/_saved/_chrome/settings.tsx` initializes slider state
from loader data without syncing it:

- `channelIdx` from `data.channelDifficulty`
- `messageIdx` from `data.messageDifficulty`

These need either direct rendering from loader data or explicit `useEffect`
syncs when the loader values change.

### Search-derived state can go stale

`webapp/src/routes/_app/_saved/_chrome/send.tsx` initializes `recipient` from
the typed `to` search param and applies it only once on mount. AGENTS.md calls
out loader data specifically, but the stale-navigation behavior is the same: the
page can retain old state when the typed search param changes.

This should be fixed with the same discipline as loader-derived state unless a
stronger route design removes the copied state entirely.

### Closed issue missing required conclusion

`issues/0010-architecture-cleanup/README.md` is closed but has no
`## Conclusion` section.

AGENTS.md also says closed issues are immutable and must never be modified. This
creates a rule conflict: fixing the missing conclusion requires explicit
approval to amend that closed issue, or a documented decision to preserve the
historical file and record the exception elsewhere.

## Requirements

- Fix all navigations and redirects without leaving implicit exceptions.
- Convert protected server functions to `authMiddleware` and `context.userId`
  where they return authenticated user data.
- Ensure all copied loader-derived state is synchronized or removed.
- Ensure copied typed search-param state cannot go stale.
- Resolve the issue 10 conclusion problem with explicit approval before editing
  the closed issue.
- Run focused verification for the affected webapp code.

## Non-Goals

- Do not perform unrelated navigation refactors.
- Do not change public/optional-auth server functions unless the experiment
  proves they are protected-only.
- Do not modify closed issues without explicit approval.

## Experiment 1: Apply the audit fixes directly

### Hypothesis

The confirmed AGENTS.md violations are small enough to fix in one coordinated
pass without changing user-facing behavior:

- The third-party auth denial redirect can be made explicit as a reviewed
  external-navigation boundary instead of an implicit `window.location.href`
  violation.
- The protected server functions can move to `authMiddleware` without affecting
  valid authenticated callers.
- The copied loader/search-derived route state can be synchronized with focused
  `useEffect` hooks.
- The historical issue 10 conclusion conflict can be resolved only after Ryan
  explicitly approves whether the closed issue may be amended.

### Plan

1. Replace the non-logout `window.location.href` helper with an approved
   external navigation approach.
   - If TanStack Router has no suitable API for leaving the app, make the
     external full-document navigation a named, documented, narrow exception and
     get explicit approval before leaving it in place.
   - Keep logout as the only unambiguous `window.location.href` use unless that
     approval is recorded.

2. Convert protected server functions to auth middleware.
   - Update `getMyChannels`, `getMyUnreadCount`, `getMyKeys`, and
     `getMyDomains` to use `.middleware([authMiddleware])`.
   - Read `context.userId` in handlers.
   - Preserve return shapes for authenticated callers.
   - Let unauthenticated direct endpoint calls fail with the auth middleware
     instead of returning empty private data shapes.

3. Synchronize copied loader-derived state.
   - In `domains.tsx`, sync `apiDomainInput` from `data.apiDomain` and
     `adminInput` from `myAddress` when the loader values change.
   - In `settings.tsx`, sync `channelIdx` and `messageIdx` from the loader
     difficulty values when those values change.

4. Synchronize copied typed search-param state.
   - In `send.tsx`, update the recipient state and validation whenever the
     typed `to` search param changes.
   - Avoid replacing active user edits unless the route search value actually
     changes.

5. Resolve the closed issue 10 conflict.
   - Stop before editing `issues/0010-architecture-cleanup/README.md`.
   - Ask Ryan for explicit approval to amend the closed issue with a conclusion,
     or record that the immutable closed issue is intentionally left unchanged.

### Verification

- `pnpm --filter @keypears/webapp typecheck`
- `pnpm --filter @keypears/webapp test`
- Targeted `rg` checks:
  - no non-approved `window.location.href` remains
  - protected `getMy*` private-data functions use `authMiddleware`
  - copied loader/search state has corresponding synchronization

### Success Criteria

- All confirmed code violations are fixed or explicitly approved as documented
  exceptions.
- The affected webapp typechecks and tests pass.
- Issue 10 is either amended with explicit approval or the exception is recorded
  in this issue without modifying the closed file.
