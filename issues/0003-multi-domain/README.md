+++
status = "closed"
opened = "2026-04-07"
closed = "2026-04-07"
+++

# Issue 3: Multi-Domain Support

## Goal

Make the KeyPears database and protocol fully compatible with hosting multiple
domains on a single server, so that one KeyPears instance (e.g. keypears.com)
can serve users at arbitrary custom domains (e.g. alice@ryanxcharles.com,
bob@acme.org). This is the foundation for hosted KeyPears, email-based auth, and
full email hosting — but this issue only covers the structural changes, not
those features themselves.

## Background

Currently, a KeyPears server serves exactly one domain, configured via
`KEYPEARS_DOMAIN` env var. Users are identified by `name@domain`, but the domain
is implicit — the server assumes all its users belong to the single configured
domain. This makes it impossible to host users from multiple domains on the same
server.

### Future features that depend on multi-domain

All three require the same foundational change: the database and protocol must
support multiple domains per server.

**Hosted KeyPears (like Google Workspace):** A domain owner sets `keypears.json`
pointing to keypears.com as the host. Users at that domain (e.g.
alice@customdomain.com) log into keypears.com. The domain owner designates an
admin account (an @keypears.com address) who controls domain config and user
policy.

**Email-based auth:** A domain with existing email hosting can mirror its email
addresses as KeyPears addresses. Users prove ownership via email verification,
then set a KeyPears password for key encryption. No DNS changes required beyond
`keypears.json`.

**Full email hosting (like Hey.com):** KeyPears hosts actual email for custom
domains. Domain verification via DNS (MX, SPF, DKIM, DMARC) plus
`keypears.json`. Email addresses are KeyPears addresses. This builds on the
architecture researched in issue 0001.

### What needs to change

**Database:**

- A `domains` table — each domain has an ID, the domain name, verification
  status, admin user reference, and configuration (e.g. PoW difficulty, user
  limits).
- Users must be associated with a domain. Currently `users.name` stores just the
  local part (e.g. "alice"). This needs to be paired with a domain reference so
  that "alice@foo.com" and "alice@bar.com" are distinct users on the same
  server.
- Name uniqueness must be scoped to domain, not global.

**Authentication:**

- Login must resolve by full address (name + domain), not just name. The server
  must look up which domain the user belongs to.
- Session creation must work the same regardless of which domain the user is on.

**Federation / API:**

- `parseLocalAddress` currently checks against a single `KEYPEARS_DOMAIN`. It
  must check against all domains hosted by this server.
- `notifyMessage` and `pullMessage` must handle messages for any hosted domain.
- `getPublicKey` must resolve keys for users on any hosted domain.
- `getPowChallenge` could return domain-specific difficulty.
- `keypears.json` at the custom domain points to the host server's API URL.

**Server config:**

- The server needs a "primary domain" (keypears.com) that it always owns, plus
  any number of hosted domains stored in the database.
- The primary domain could be seeded from `KEYPEARS_DOMAIN` env var, but hosted
  domains come from the database.

### What stays the same

- The three-tier KDF and session token system.
- ECDH encryption and message format.
- The pull-model federation protocol.
- PoW for account creation, login, and messaging.
- The `keypears.json` well-known file format.

## Experiments

### Experiment 1: Add domains table and domainId to users

#### Description

Add a `domains` table and associate every user with a domain. The primary
domain is seeded from `KEYPEARS_DOMAIN` on startup. All existing single-domain
code is updated to be domain-aware: user lookups, login, name availability
checks, address construction, and local address detection.

After this experiment, the system still operates as single-domain in practice
(only the primary domain exists), but the data model and code paths are ready
for additional domains.

#### Changes

**`webapp/src/db/schema.ts`** — Add `domains` table and `domainId` to `users`:

```ts
export const domains = mysqlTable("domains", {
  id: binaryId("id").primaryKey(),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Add `domainId` column to `users`:

```ts
domainId: binaryId("domain_id").notNull(),
```

Add unique index on `(name, domainId)` to `users` — name uniqueness is scoped
to domain. Remove any existing global uniqueness assumption on `name`.

**`webapp/src/server/user.server.ts`** — Domain-aware user functions:

- Add `getOrCreatePrimaryDomain()` — looks up domain matching
  `KEYPEARS_DOMAIN`, creates it if missing. Called during startup or lazily on
  first use. Caches the result.
- Change `insertUser()` to accept `domainId` and store it.
- Change `getUserByName(name)` to `getUserByNameAndDomain(name, domainId)` —
  queries by `(name, domainId)`.
- Change `saveUser()` to check name uniqueness within domain.
- Change `verifyLogin(name, loginKeyHex)` to
  `verifyLogin(name, domainId, loginKeyHex)`.
- Add `getDomainByName(domain)` — looks up a domain record by name.
- Add `isLocalDomain(domain)` — checks if a domain is hosted by this server
  (exists in the `domains` table).

**`webapp/src/lib/config.ts`** — Replace single-domain helpers:

- `parseLocalAddress()` can no longer check against a single domain. It must
  be removed or changed to an async function that checks the `domains` table.
  Since it's called in server-only code, making it async is fine.
- `makeAddress(name)` needs a domain parameter: `makeAddress(name, domain)`.
- `getDomain()` stays as the primary domain for backwards compatibility (used
  by the welcome page, login page, etc.).

**`webapp/src/server/user.functions.ts`** — Update all handlers:

- `createUser` — resolve primary domain, pass `domainId` to `insertUser()`.
- `saveMyUser` — pass domain-scoped name check.
- `login` — parse full address to extract name + domain, resolve domain to
  `domainId`, pass both to `verifyLogin()`.
- `checkNameAvailable` — accept full address or name + domain, check within
  domain scope.
- `getProfile` — accept full address, resolve domain.

**`webapp/src/server/message.functions.ts`** — Update local/remote detection:

- `sendMessage` — replace `parsed.domain === getDomain()` with
  `isLocalDomain(parsed.domain)`. Use `getUserByNameAndDomain` for recipient
  lookups. Construct sender address with actual domain from user's `domainId`.
- `getPublicKeyForAddress` — same local domain check change.

**`webapp/src/server/api.router.ts`** — Update federation endpoints:

- `getPublicKey` — replace `parseLocalAddress` with domain-aware lookup: parse
  address, check if domain is local, look up user by name + domainId.
- `notifyMessage` — same pattern for recipient lookup.
- `serverInfo` — could return list of hosted domains or just the primary.

**`webapp/src/server/config.functions.ts`** — `getServerDomain()` stays as-is
(returns primary domain for the welcome/login UI).

**`webapp/src/routes/_app/welcome.tsx`** — No changes needed. Users on the
welcome page are creating accounts on the primary domain. The UI already uses
`getServerDomain()` for display.

**`webapp/src/routes/login.tsx`** — No changes needed immediately. Login
already accepts full `name@domain` addresses. The server-side `login` handler
will parse the domain and resolve it.

#### Verification

1. Existing single-domain flow works unchanged: create account, set password,
   log in, send messages, federation between keypears.test and passapples.test.
2. The `domains` table has one row for the primary domain.
3. All users have a `domainId` pointing to the primary domain.
4. `getUserByNameAndDomain("alice", primaryDomainId)` returns Alice.
5. `getUserByNameAndDomain("alice", somethingElse)` returns null.
6. `isLocalDomain("keypears.test")` returns true.
7. `isLocalDomain("example.com")` returns false.
8. Name uniqueness is scoped to domain — if a second domain were manually
   inserted, two users named "alice" could exist (one per domain).

**Result:** Pass

#### Conclusion

All user lookups, login, name checks, and federation endpoints are now
domain-aware. The primary domain is created lazily on first user save. The
system operates identically to before for single-domain use but the schema and
code paths are ready for additional domains.

## Conclusion

The database and protocol are now forwards-compatible with hosting multiple
domains on a single KeyPears server. The `domains` table stores each hosted
domain. Users are associated with a domain via `domainId`, and name uniqueness
is scoped to `(name, domainId)`. All server code — authentication, messaging,
federation, profile lookup — resolves users by name + domain rather than name
alone. `isLocalDomain()` replaces the old single-domain check, so the server
can recognize any domain it hosts as local.

### Next steps

The multi-domain foundation enables three paths forward:

**Email-based auth for existing domains.** Domain owners who already have email
can verify their users via email. This requires the ability to send email from
the KeyPears server — either via a built-in SMTP capability or a third-party
relay.

**Built-in email hosting.** KeyPears addresses could also be real email
addresses if the server includes SMTP send/receive. This would let anyone
running a KeyPears node host email for their domain without depending on
external services like AWS SES. A built-in approach keeps the system
self-contained and deployable on any infrastructure.

**Domain admin and policy.** The `domains` table can be extended with admin
user references, PoW difficulty overrides, user limits, and other per-domain
configuration. This is straightforward once the basic multi-domain plumbing is
in place.
