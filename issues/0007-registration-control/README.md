+++
status = "open"
opened = "2026-04-09"
+++

# Issue 7: Registration Control

## Goal

Allow domain admins to disable open registration on their KeyPears server so
that only the admin can create users. This is essential for self-hosted
deployments where the operator doesn't want arbitrary signups.

## Background

Currently, anyone can create an account on any KeyPears server via PoW. This is
correct for the primary keypears.com server but wrong for self-hosted nodes. A
business running their own KeyPears server wants to control who has accounts.

### How it works

1. Deploy a KeyPears server. Open registration is on by default.
2. Create your own account (PoW-gated, like any user).
3. Set yourself as admin in the domain's `keypears.json`.
4. Claim the domain on the Domains page.
5. Toggle open registration off for that domain.
6. From now on, only the admin can create users (via the Domains page). The
   "Create an Account" button on the landing page is disabled or hidden.

This mirrors how most self-hosted software works: bootstrap your admin account
while registration is open, then lock it down.

### Two controls

**1. Open registration (per domain).**

Controls whether anyone can create an account on this domain via PoW, or only
the admin can create users. Default: open. The admin toggles it off after
bootstrapping their own account.

**2. Third-party domain hosting (server-level).**

Controls whether users on this server can claim external domains. If disabled,
no one can add domains other than the primary domain. If enabled, any user who
proves ownership via `keypears.json` can claim a domain.

The `keypears.json` verification already proves domain ownership — if someone
can set `keypears.json` on a domain, they legitimately control it. This toggle
just controls whether the server accepts hosting duties for external domains.

Default: on. The first admin must manually disable it after bootstrapping if
they don't want external domains hosted on their server.

### What needs to change

**Database:**

- Add `openRegistration` boolean column to `domains` table (default true).
- Add `allowThirdPartyDomains` boolean column to `domains` table (default true).
  Only meaningful on the primary domain — controls server-wide behavior.

**Server:**

- `createUser` — check if the primary domain allows open registration. If not,
  reject with a clear error ("Registration is closed").
- `claimDomain` — check if the primary domain allows third-party domains. If
  not, reject with "Third-party domain hosting is disabled."
- Admin can always create users via `createDomainUser` regardless of the
  registration setting.

**UI:**

- Landing page (`index.tsx`) — if registration is closed, hide the "Create an
  Account" button and show a message like "Registration is closed. Contact the
  administrator."
- Domains page (`domains.tsx`) — add toggles for:
  - Open/closed registration per domain the admin controls.
  - Allow/disallow third-party domains (only shown to the primary domain's
    admin).

**API:**

- Add a server function to toggle registration for a domain (admin only,
  re-verified against `keypears.json`).
- Add a server function to toggle third-party domain hosting (primary domain
  admin only).
- Add a server function or modify existing ones to expose whether registration
  is open (needed by the landing page).

## Experiments

### Experiment 1: Add registration and hosting controls

#### Description

Add two boolean columns to the `domains` table, wire them into the relevant
server functions, add admin toggles to the Domains page, and update the landing
page to respect the registration setting.

#### Changes

**`webapp/src/db/schema.ts`:**

- Add to `domains` table:
  - `openRegistration` boolean, default true.
  - `allowThirdPartyDomains` boolean, default true.

**`webapp/src/server/user.server.ts`:**

- Add `getPrimaryDomain()` — returns the domain matching `getDomain()`. Used to
  check server-level settings.
- Add `toggleOpenRegistration(domainId, value)` — sets the boolean.
- Add `toggleAllowThirdPartyDomains(domainId, value)` — sets the boolean.

**`webapp/src/server/user.functions.ts`:**

- `createUser` — before creating the user, look up the primary domain. If
  `openRegistration` is false, throw "Registration is closed."
- `claimDomainFn` — before claiming, look up the primary domain. If
  `allowThirdPartyDomains` is false, throw "Third-party domain hosting is
  disabled."
- Add `toggleOpenRegistrationFn(domainName, value)` — admin-verified toggle for
  a domain's open registration.
- Add `toggleAllowThirdPartyDomainsFn(value)` — admin-verified toggle on the
  primary domain. Only the primary domain's admin (via `keypears.json`) can
  change this.
- Add `isRegistrationOpen()` — returns whether the primary domain allows open
  registration. Called by the landing page loader.

**`webapp/src/routes/index.tsx`:**

- Loader calls `isRegistrationOpen()`.
- If closed, hide "Create an Account" and show "Registration is closed. Contact
  the administrator." with a "Log in" link.
- If open, show the current flow unchanged.

**`webapp/src/routes/_app/_saved/_chrome/domains.tsx`:**

- For each domain the admin controls, show an "Open registration" toggle (on/off
  switch or checkbox).
- If the user is also the primary domain's admin, show an "Allow third-party
  domains" toggle at the top of the page.
- Toggling calls the server function, re-verifies admin via `keypears.json`,
  updates the database.

#### Verification

1. Fresh start: create account on keypears.test — works (registration open by
   default).
2. Set up as admin of keypears.test via `keypears.json`.
3. Go to Domains page. Toggle "Open registration" off for keypears.test.
4. Log out. Visit keypears.test — "Create an Account" is hidden, "Registration
   is closed" message shown. "Log in" link still works.
5. Log back in as admin. Go to Domains, toggle registration back on. Landing
   page shows "Create an Account" again.
6. Toggle "Allow third-party domains" off.
7. As another user, try to claim lockberries.test — fails with "Third-party
   domain hosting is disabled."
8. Admin toggles it back on. Claiming lockberries.test succeeds.
9. Admin creates a user on lockberries.test via Domains page — works regardless
   of the lockberries.test registration setting.
10. Toggle lockberries.test open registration off. Direct signups for
    lockberries.test are blocked (if we ever add per-domain signup).
