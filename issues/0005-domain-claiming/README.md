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
     "apiDomain": "keypears.com",
     "admin": "ryan@keypears.com"
   }
   ```
3. In KeyPears, they click "Add a domain" and enter `ryanxcharles.com`.
4. KeyPears fetches the `keypears.json` file over HTTPS, verifying:
   - The file exists and is valid JSON.
   - The `apiDomain` matches this KeyPears server's domain.
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

## Experiments

### Experiment 1: Domain claiming and user creation

#### Description

Add the ability for a logged-in KeyPears user to claim a custom domain and
create user accounts under it. The flow:

1. User navigates to a "Domains" page in the app.
2. Enters a domain name (e.g. `lockberries.test`).
3. Server fetches `https://lockberries.test/.well-known/keypears.json`.
4. Verifies `apiDomain` matches this server's `KEYPEARS_API_DOMAIN`.
5. Verifies `admin` matches the logged-in user's full address.
6. Domain is added to the `domains` table with the user as admin.
7. Admin can then create users under the domain from the same page.
8. Created users can log in with their `@lockberries.test` addresses.

#### Changes

**`webapp/src/db/schema.ts`** — Extend `domains` table:

```ts
export const domains = mysqlTable("domains", {
  id: binaryId("id").primaryKey(),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  adminUserId: binaryId("admin_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

`adminUserId` is nullable — the primary domain (created by
`getOrCreateDomain`) has no admin. Claimed domains have an admin.

**`lockberries/src/pages/.well-known/keypears.json.ts`** — Add `admin` field:

```ts
return {
  apiDomain: isProd ? "keypears.com" : "keypears.test",
  admin: isProd ? "ryan@keypears.com" : "ryan@keypears.test",
};
```

**`webapp/src/server/user.server.ts`** — Add domain claiming functions:

- `claimDomain(domain, adminUserId, adminAddress)` — fetches
  `keypears.json` from the domain over HTTPS, verifies `apiDomain` matches
  `getApiDomain()`, verifies `admin` matches `adminAddress`, inserts into
  `domains` table with `adminUserId`. Throws if verification fails.
- `getDomainsForAdmin(userId)` — returns all domains where
  `adminUserId = userId`.
- `getUsersForDomain(domainId)` — returns all saved users in a domain.

**`webapp/src/server/user.functions.ts`** — Add server functions:

- `claimDomainFn(domain)` — requires session. Looks up the logged-in user's
  full address, calls `claimDomain`. Returns the new domain record.
- `getMyDomains()` — requires session. Returns domains administered by
  the current user.
- `getDomainUsers(domainId)` — requires session. Verifies caller is admin
  of the domain, returns user list.
- `createDomainUser(domainId, name, loginKey, publicKey, encryptedPrivateKey)`
  — requires session. Verifies caller is admin. Creates a new saved user
  under the domain (similar to the `saveMyUser` flow but for a different
  user). The admin sets the initial password and key pair on behalf of
  the new user.

**`webapp/src/routes/_app/_saved/_chrome/domains.tsx`** — New route:

Domain management page with two sections:

1. **Claim a domain** — input field for domain name, "Claim" button.
   Shows success/error feedback. Explains that the domain must have a
   `keypears.json` file with `admin` set to the current user's address.

2. **My domains** — list of claimed domains. Each domain expands to show:
   - Users under that domain (name, created date).
   - "Add user" form (name, password fields) to create a new user.

#### Verification

1. Log in as `ryan@keypears.test`.
2. Navigate to Domains page.
3. Claim `lockberries.test` — server fetches keypears.json, verifies
   admin is `ryan@keypears.test`, domain appears in "My domains".
4. Create user `alice` under `lockberries.test` (set password + name).
5. Log out. Log in as `alice@lockberries.test` — succeeds.
6. Send a message from `alice@lockberries.test` to `ryan@keypears.test` —
   federation works (both are on the same server but different domains).
7. Claiming a domain with wrong admin or wrong apiDomain fails with a
   clear error message.
8. Claiming a domain that doesn't serve keypears.json fails gracefully.
