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

## Experiments

### Experiment 1: Add all indexes and pending delivery cleanup

#### Description

Add all missing indexes to the schema and implement expiration + lazy cleanup
for `pending_deliveries`.

#### Changes

**`webapp/src/db/schema.ts`:**

Add indexes using Drizzle's `index()` function in table config callbacks:

- `user_keys`: index on `userId`
- `messages`: index on `channelId`
- `sessions`: index on `userId`
- `pow_log`: index on `userId`
- `pending_deliveries`: index on `tokenHash`, add `expiresAt` timestamp column
  (default 24 hours from creation)
- `users`: index on `domainId`
- `domains`: index on `adminUserId`

For tables that already have a config callback (`channels`, `users`), add the
new index to the existing callback. For tables without one, add a callback.

**`webapp/src/server/federation.server.ts`:**

- `deliverRemoteMessage` — set `expiresAt` to 24 hours from now when inserting a
  pending delivery.

**`webapp/src/server/api.router.ts`:**

- `pullMessage` — after pulling, lazy-delete expired pending deliveries:
  `db.delete(pendingDeliveries).where(lt(pendingDeliveries.expiresAt, new Date()))`.

#### Verification

1. `bun run db:clear && bun run db:push` succeeds with all new indexes.
2. All existing functionality works unchanged (create account, send messages,
   federation, key rotation, domain claiming).
3. `SHOW INDEX FROM user_keys` shows index on `userId`.
4. `SHOW INDEX FROM messages` shows index on `channelId`.
5. `SHOW INDEX FROM sessions` shows index on `userId`.
6. `SHOW INDEX FROM pow_log` shows index on `userId`.
7. `SHOW INDEX FROM pending_deliveries` shows index on `tokenHash`.
8. `SHOW INDEX FROM users` shows index on `domainId`.
9. `SHOW INDEX FROM domains` shows index on `adminUserId`.
10. Pending deliveries have an `expiresAt` value 24 hours in the future.
11. After pulling a message, expired pending deliveries are cleaned up.
