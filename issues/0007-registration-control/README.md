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

### What needs to change

**Database:**

- Add `openRegistration` boolean column to `domains` table (default true).

**Server:**

- `createUser` — check if the primary domain allows open registration. If not,
  reject with a clear error ("Registration is closed").
- Admin can always create users via `createDomainUser` regardless of the
  registration setting.

**UI:**

- Landing page (`index.tsx`) — if registration is closed, hide the "Create an
  Account" button and show a message like "Registration is closed. Contact the
  administrator."
- Domains page (`domains.tsx`) — add a toggle for open/closed registration per
  domain the admin controls.

**API:**

- Add a server function to toggle registration for a domain (admin only,
  re-verified against `keypears.json`).
- Add a server function or modify existing ones to expose whether registration
  is open (needed by the landing page).
