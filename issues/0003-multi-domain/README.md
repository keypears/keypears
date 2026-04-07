+++
status = "open"
opened = "2026-04-07"
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
