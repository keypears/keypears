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

Default: on. The first admin must manually disable it after bootstrapping
if they don't want external domains hosted on their server.

### What needs to change

**Database:**

- Add `openRegistration` boolean column to `domains` table (default true).
- Add `allowThirdPartyDomains` boolean column to `domains` table (default
  true). Only meaningful on the primary domain — controls server-wide behavior.

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
