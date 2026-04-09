+++
status = "open"
opened = "2026-04-09"
+++

# Issue 8: Schema Indexes and Cleanup

## Goal

Add missing database indexes and a cleanup mechanism for pending deliveries
before launch. Without indexes, most queries are full table scans. Without
cleanup, the pending_deliveries table grows unbounded.

## Background

A schema audit revealed that every table except `domains` and `used_pow` is
missing indexes on columns used in WHERE clauses. This is fine for development
with small datasets but will cause serious performance problems in production.

Additionally, `pending_deliveries` has no expiration or cleanup mechanism.
Messages that are never pulled (e.g. recipient server was down) accumulate
forever.

### Missing indexes (critical)

| Table                | Column(s)     | Used by                               |
| -------------------- | ------------- | ------------------------------------- |
| `user_keys`          | `userId`      | All key lookups, rotation, count, max |
| `messages`           | `channelId`   | All message queries, unread counts    |
| `sessions`           | `userId`      | Logout, revoke all sessions           |
| `pow_log`            | `userId`      | PoW total, cumulative difficulty      |
| `pending_deliveries` | `tokenHash`   | Message pull                          |
| `users`              | `domainId`    | getUsersForDomain                     |
| `domains`            | `adminUserId` | getDomainsForAdmin                    |

### Missing indexes (medium)

| Table   | Column(s)   | Used by                |
| ------- | ----------- | ---------------------- |
| `users` | `expiresAt` | Unsaved user recycling |

### Missing cleanup

- `pending_deliveries` — no expiration column, no cleanup. Need to add
  `expiresAt` and lazy cleanup (same pattern as `used_pow`).

### Not in scope

- Foreign key constraints — application logic handles integrity. Can add later
  if needed.
- Connection pool tuning — can be configured per deployment via DATABASE_URL
  params.
