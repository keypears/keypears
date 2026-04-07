+++
status = "open"
opened = "2026-04-07"
+++

# Issue 5: Domain Claiming via keypears.json

## Goal

Allow KeyPears users to claim custom domains and create user accounts under
those domains, without requiring email infrastructure. Domain ownership is
proven via the existing `keypears.json` well-known file.

## Background

Issue 0003 added multi-domain support to the database (domains table, users
scoped to domainId). Issue 0004 explored email sending for domain verification
but concluded that email is unnecessary — domain ownership can be proven with
HTTPS alone.

### How it works

1. A user (e.g. `ryan@keypears.com`) owns a domain (e.g. `ryanxcharles.com`).
2. They place a `keypears.json` file at
   `https://ryanxcharles.com/.well-known/keypears.json` containing:
   ```json
   {
     "version": 1,
     "apiUrl": "https://keypears.com/api",
     "admin": "ryan@keypears.com"
   }
   ```
3. In KeyPears, they click "Add a domain" and enter `ryanxcharles.com`.
4. KeyPears fetches the `keypears.json` file over HTTPS, verifying:
   - The file exists and is valid JSON.
   - The `apiUrl` points to this KeyPears server.
   - The `admin` field matches the logged-in user's address.
5. The domain is added to the `domains` table with the user as admin.
6. The admin can now create user accounts under the domain (e.g.
   `alice@ryanxcharles.com`).
7. Those users log into `keypears.com` with their `@ryanxcharles.com` addresses.

### Trust model

- Domain ownership is proven by controlling the web server at that domain (same
  as TLS certificate issuance, same as federation discovery).
- The admin is an existing KeyPears user with a proven identity.
- No email, no DNS TXT records, no SMTP — just HTTPS.

### What needs to change

**Database:**

- Extend `domains` table with `adminUserId` (the KeyPears user who owns the
  domain) and `verified` status.
- The primary domain (from `KEYPEARS_DOMAIN`) has no admin — it's the server's
  own domain.

**`keypears.json` format:**

- Add optional `admin` field (string, full KeyPears address).
- Existing servers without `admin` continue to work (federation only).

**Server functions:**

- `claimDomain(domain)` — fetch keypears.json, verify admin matches current
  user, verify apiUrl matches this server, insert into domains table.
- `createDomainUser(domain, name, ...)` — admin creates a user under their
  domain. Similar to the existing registration flow but scoped to a domain.

**UI:**

- Domain management page (accessible to logged-in users).
- "Add a domain" form — enter domain name, server verifies.
- User list for each domain — admin can create/manage users.
- Login page — already accepts full `name@domain` addresses. No changes needed.
