+++
status = "open"
opened = "2026-04-11"
+++

# Database Schema Scalability

## Goal

Fix all identified scalability bottlenecks in the database schema so that the
system handles growth in users, messages, and PoW volume without degradation.

## Background

A scalability audit of the schema (`webapp/src/db/schema.ts`) and all query
patterns across the server layer identified several issues. They fall into three
categories: missing indexes, unbounded table growth, and a locking bottleneck.

### 1. Missing indexes

Several queries filter or sort on columns that lack index coverage. These
degrade from O(log n) to O(n) as tables grow.

| Table                | Query pattern                                   | Problem                                                       | Fix                                                             |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| `messages`           | `WHERE channelId = ? ORDER BY id DESC LIMIT 20` | Single-column `channelId` index can't satisfy the sort        | Composite index `(channelId, id)`                               |
| `messages`           | `WHERE channelId = ? AND isRead = false`        | Unread count/grouping scans all messages in a channel         | Composite index `(channelId, isRead)`                           |
| `channels`           | `WHERE ownerId = ? ORDER BY updatedAt DESC`     | Existing unique index covers the filter but not the sort      | Composite index `(ownerId, updatedAt)`                          |
| `users`              | `WHERE expiresAt < ? AND passwordHash IS NULL`  | Full table scan (no index on `expiresAt`)                     | Index on `(expiresAt)` or composite `(passwordHash, expiresAt)` |
| `sessions`           | `WHERE expiresAt < NOW()`                       | Lazy cleanup does a full table scan on every login            | Index on `expiresAt`                                            |
| `used_pow`           | `WHERE expiresAt < NOW()`                       | Lazy cleanup does a full table scan on every PoW verification | Index on `expiresAt`                                            |
| `pending_deliveries` | `WHERE expiresAt < NOW()`                       | Lazy cleanup does a full table scan                           | Index on `expiresAt`                                            |

### 2. Unbounded table growth

Three tables are append-only with no archival or bulk-purge strategy:

- **`used_pow`** — One row per PoW solution (every login, signup, message).
  Grows linearly with all platform activity. Lazy inline cleanup
  (`DELETE WHERE expiresAt < NOW()`) is both unindexed and insufficient at scale
  because it runs once per verification rather than in bulk.

- **`pow_log`** — Audit log of every PoW ever performed. Never pruned. Used only
  for display (cumulative difficulty, history page). Will eventually dominate
  storage.

- **`messages`** — Chat messages accumulate forever. Each row includes a `TEXT`
  column (`encrypted_content`) stored off-page in InnoDB. At millions of
  messages the table grows to many gigabytes, slowing backups and schema
  migrations.

### 3. User-recycling locking bottleneck

`insertUser()` in `user.server.ts` runs a `SELECT ... FOR UPDATE` scanning for
expired unsaved users to recycle their rows. With no index on the filter columns
(`passwordHash IS NULL AND expiresAt < NOW()`), this acquires row locks while
scanning the entire `users` table. Under concurrent signups this serializes all
user creation. This is the single worst scalability bottleneck in the schema.

### 4. Version counter race condition (minor)

`createNewVersion()` in `vault.server.ts` reads `max(version)` before the
transaction's insert. Two concurrent updates to the same secret could read the
same max and produce a duplicate version number. The unique index on
`(secretId, version)` catches this as a constraint violation, but there is no
retry logic. Low probability since it requires concurrent edits to the same
secret by the same user.

### Out of scope

- **`TIMESTAMP` Y2038 limit** — All `timestamp` columns overflow in 2038. Worth
  migrating to `datetime` eventually, but not urgent.
- **`TEXT` vs `varbinary` for encrypted data** — `TEXT` incurs off-page storage
  overhead, but changing it requires a migration of existing data and is a
  separate decision.

## Experiment 1: Add missing indexes

### Hypothesis

Every scalability problem identified in sections 1--3 that can be solved by
adding an index should be solved now. Unbounded table growth (section 2) is
acknowledged but deferred — adding indexes to the cleanup queries is sufficient
for now; an archival or deletion strategy may be needed in the future. The
user-recycling bottleneck (section 3) is also an index problem: the
`SELECT ... FOR UPDATE` scans the full `users` table because there is no index
on the filter columns.

### Changes

Add the following indexes to `webapp/src/db/schema.ts`:

1. **`messages`** — composite `(channelId, id)` to cover keyset pagination
   (`WHERE channelId = ? ORDER BY id DESC`). This replaces the existing
   single-column `channel_id_idx`.

2. **`messages`** — composite `(channelId, isRead)` to cover unread-count
   queries (`WHERE channelId = ? AND isRead = false`).

3. **`channels`** — composite `(ownerId, updatedAt)` to cover the channel-list
   query (`WHERE ownerId = ? ORDER BY updatedAt DESC`). This is in addition to
   the existing unique index on `(ownerId, counterpartyAddress)`.

4. **`users`** — index on `(expiresAt)` to cover the user-recycling query
   (`WHERE expiresAt < ? AND passwordHash IS NULL ... FOR UPDATE`). MySQL can
   use this to range-scan expired rows and skip the rest of the table, removing
   the full-table lock under concurrent signups.

5. **`sessions`** — index on `(expiresAt)` to cover lazy cleanup
   (`DELETE WHERE expiresAt < NOW()`).

6. **`used_pow`** — index on `(expiresAt)` to cover lazy cleanup
   (`DELETE WHERE expiresAt < NOW()`).

7. **`pending_deliveries`** — index on `(expiresAt)` to cover lazy cleanup
   (`DELETE WHERE expiresAt < NOW()`).

After adding the indexes, run `bun run db:push` to apply, then `bun run test`
and `bun run lint` to verify nothing breaks.

### Pass criteria

- All seven indexes exist in the schema.
- `db:push` applies cleanly.
- Tests and linter pass.
