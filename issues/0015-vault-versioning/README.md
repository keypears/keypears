+++
status = "open"
opened = "2026-04-11"
+++

# Vault Secret Versioning

## Goal

Make vault entries append-only. Editing a secret creates a new version instead
of overwriting. Older versions are immutable and browsable.

## Background

Currently, editing a vault entry overwrites the encrypted data in place. The old
value is gone forever. This is a problem:

- **No undo**: accidentally overwrite a password, it's lost.
- **No audit trail**: can't see what a password was last week.
- **No conflict detection**: if you share a secret and the recipient edits it,
  there's no way to know what changed.

kp1 solved this with `globalOrder` (vault-wide sequence) and `localOrder`
(per-secret sequence). Each update was an immutable row. The latest version was
just the highest `localOrder` for a given `secretId`.

### Design

Each vault entry gets a `secretId` (groups all versions of the same secret) and
a `version` number (1, 2, 3...). The current `id` remains the primary key — each
version is its own row.

- **Create**: new `secretId`, version 1.
- **Edit**: new row with same `secretId`, version N+1. Old rows untouched.
- **Delete**: soft delete — a new version with a `deleted` flag, or just hide
  entries where the latest version is marked deleted.
- **View**: show the latest version by default. Option to browse history.

### Schema change

```sql
vault_entries (
  id                binary(16) PK       -- UUIDv7 (unique per version)
  user_id           binary(16) NOT NULL
  secret_id         binary(16) NOT NULL  -- groups versions together
  version           int NOT NULL         -- 1, 2, 3...
  name              varchar(255) NOT NULL
  type              varchar(32) NOT NULL
  search_terms      varchar(255) NOT NULL DEFAULT ''
  public_key        varchar(66) NOT NULL
  encrypted_data    text NOT NULL
  source_message_id binary(16)
  source_address    varchar(255)
  created_at        timestamp NOT NULL DEFAULT NOW()

  INDEX (user_id)
  UNIQUE INDEX (secret_id, version)
)
```

Changes from current schema:

- Add `secretId` — a UUIDv7 that groups versions. On first create, `secretId` is
  generated alongside `id`. On edit, `secretId` is copied from the previous
  version.
- Add `version` — integer starting at 1, incremented on each edit.
- Remove `updatedAt` — each version has its own `createdAt`. The "updated" time
  is the `createdAt` of the latest version.
- Add unique index on `(secretId, version)`.

### Query patterns

**List entries (vault page)**: get the latest version of each secret.

```sql
SELECT ve.* FROM vault_entries ve
INNER JOIN (
  SELECT secret_id, MAX(version) AS max_version
  FROM vault_entries WHERE user_id = ?
  GROUP BY secret_id
) latest ON ve.secret_id = latest.secret_id
  AND ve.version = latest.max_version
WHERE ve.user_id = ?
ORDER BY ve.created_at DESC
```

**View entry**: get a specific version by `id`, or the latest by `secretId`.

**History**: get all versions of a secret ordered by version desc.

```sql
SELECT * FROM vault_entries
WHERE secret_id = ? AND user_id = ?
ORDER BY version DESC
```

### UX

- **Edit** creates a new version. The form looks the same. Save creates a new
  row.
- **Entry detail** shows the latest version. A small "History" link or version
  badge shows the version number. Clicking it shows a list of all versions with
  timestamps.
- **History view**: list of versions with `createdAt`. Click a version to view
  its fields (read-only). Option to "restore" a version (creates a new version
  with the old data).
- **Vault list**: sorted by latest version's `createdAt` (most recently modified
  first).

### What changes for existing code

- `createVaultEntry` generates both `id` and `secretId`, version 1.
- `updateVaultEntry` becomes "create new version" — generates new `id`, copies
  `secretId`, increments version.
- `deleteVaultEntry` either hard-deletes all versions, or soft-deletes by
  creating a tombstone version.
- `getVaultEntries` uses the subquery to get latest versions only.
- `getVaultEntry` unchanged (fetches by `id`).
- New: `getSecretHistory(secretId)` returns all versions.

### Deletion

Three levels of delete:

- **Delete a single version**: removes one historical row. The secret persists
  as long as at least one version remains. Useful for cleaning up old versions
  you no longer need.
- **Delete all versions**: removes the entire secret and all its history. This
  is the "delete secret" action from the main menu.
- **No soft delete**: all deletes are hard deletes. Simpler, matches current
  behavior. If you want to keep something, don't delete it.

### History UI

Inline on the detail page — a collapsible "History" section below the fields.
Shows a list of versions with version number and timestamp. Click a version to
expand and view its fields (read-only). Each version has a delete button and a
"Restore" button (creates a new version with the old data).

## Experiments

### Experiment 1: Schema and server changes

#### Description

Add `secretId` and `version` to the schema. Update all server functions and
queries. No UI changes in this experiment — the UI continues to work as before,
just backed by the new schema. The detail page still navigates by `id` (now
the version ID). The vault list shows latest versions only.

#### Schema

Update `vault_entries` in `schema.ts`:

```typescript
secretId: binaryId("secret_id").notNull(),
version: int("version").notNull(),
// remove updatedAt
```

Add unique index on `(secretId, version)`.

#### Server changes — `vault.server.ts`

**`createVaultEntry`**: generate both `id` and `secretId`, set `version: 1`.
Return `{ id, secretId }`.

**`updateVaultEntry`** → rename to **`createNewVersion`**: takes `secretId`,
looks up `MAX(version)`, creates a new row with `version: N+1` and a new `id`.
Returns the new `id`. Does NOT modify the old row.

**`getVaultEntries`**: replace simple query with subquery that fetches latest
version per `secretId`:

```typescript
// Subquery: latest version ID per secret
const latestVersions = db
  .select({
    secretId: vaultEntries.secretId,
    maxVersion: max(vaultEntries.version).as("max_version"),
  })
  .from(vaultEntries)
  .where(eq(vaultEntries.userId, userId))
  .groupBy(vaultEntries.secretId)
  .as("latest");

// Join to get full rows for latest versions only
db.select(...)
  .from(vaultEntries)
  .innerJoin(latestVersions, and(
    eq(vaultEntries.secretId, latestVersions.secretId),
    eq(vaultEntries.version, latestVersions.maxVersion),
  ))
  .where(...)
```

**`getVaultEntry`**: unchanged — fetches by `id` (version-specific).

**`deleteVaultEntry`**: unchanged — deletes one row by `id`.

**New: `deleteSecret(userId, secretId)`**: deletes ALL versions of a secret.

**New: `getSecretHistory(userId, secretId)`**: returns all versions ordered by
version desc.

#### Server functions — `vault.functions.ts`

**`updateEntry`** → calls `createNewVersion` instead of `updateVaultEntry`.
Returns `{ id }` (the new version's ID).

**`deleteEntry`**: unchanged — deletes one version by `id`.

**New: `deleteSecret`**: deletes all versions by `secretId`.

**New: `getHistory`**: returns all versions of a secret.

#### Verification

1. `bun run db:clear && bun run db:push` — schema updated
2. Create a vault entry — has `secretId` and `version: 1`
3. Edit the entry — new row with `version: 2`, old row untouched
4. Vault list shows latest version only
5. Delete the entry — deletes the specific version
6. `bun run lint` — clean
7. `bun run build` — passes

#### Result: Pass

Schema updated with `secretId` and `version`. `createNewVersion` appends a new
row. `getVaultEntries` uses subquery for latest versions. Delete from the menu
deletes all versions via `deleteSecretFn`. Edit creates a new version and
navigates to its ID. Lint clean, build passes.

### Experiment 2: Inline history UI

#### Description

Add a collapsible "History" section to the vault entry detail page. Shows all
versions of the current secret with timestamps. Each version is expandable to
view its fields (read-only). Each version has a delete button (removes that
single version) and a "Restore" button (creates a new version with the old
data).

#### Changes

**`vault.$id.tsx`**:

1. Load history in the route loader alongside the entry. Call `getHistory` with
   the entry's `secretId`.

2. Add a collapsible "History" section below the fields. Collapsed by default.
   Header shows "History (N versions)".

3. When expanded, list all versions ordered by version desc. Each version
   shows:
   - Version number and timestamp
   - Expand button to view fields (decrypt and render read-only, same as the
     main entry view)
   - "Restore" button — calls `updateEntry` with the old version's data,
     creating a new latest version. Navigates to the new version's ID.
   - "Delete" button — calls `deleteEntry` with the version's `id`. If it's
     the only version, deletes the whole secret and navigates to `/vault`.

4. The current (latest) version is excluded from the history list — it's
   already shown in the main view.

#### Verification

1. Create a secret, edit it twice → history shows 2 older versions
2. Expand a version → see its fields read-only
3. Click Restore → new version created with old data, navigates to it
4. Click Delete on a version → that version removed, others persist
5. Delete the only version → secret deleted, navigates to vault
6. `bun run lint` — clean
7. `bun run build` — passes

#### Result: Pass

Inline history section added to vault entry detail page. Collapsible, shows
older versions with expand/restore/delete per version. Passwords masked in
history view. Restore creates a new version with old data. Delete removes a
single version. Lint clean, build passes.

### Experiment 3: Two-table architecture

#### Description

Split `vault_entries` into two tables: `secrets` (one row per secret, holds
metadata) and `secret_versions` (one row per version, holds encrypted data).
This eliminates the `GROUP BY` subquery on every list page load.

#### Schema

Replace `vault_entries` with:

```typescript
export const secrets = mysqlTable("secrets", {
  id: binaryId("id").primaryKey(),
  userId: binaryId("user_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  searchTerms: varchar("search_terms", { length: 255 }).notNull().default(""),
  sourceMessageId: binaryId("source_message_id"),
  sourceAddress: varchar("source_address", { length: 255 }),
  latestVersionId: binaryId("latest_version_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("secret_user_id_idx").on(table.userId),
]);

export const secretVersions = mysqlTable("secret_versions", {
  id: binaryId("id").primaryKey(),
  secretId: binaryId("secret_id").notNull(),
  version: int("version").notNull(),
  publicKey: varchar("public_key", { length: 66 }).notNull(),
  encryptedData: text("encrypted_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("sv_secret_id_idx").on(table.secretId),
  uniqueIndex("sv_secret_version_idx").on(table.secretId, table.version),
]);
```

Key design decisions:
- `secrets.latestVersionId` points to the current version — avoids any join
  for listing. Updated on every edit.
- `secrets.updatedAt` updated on every edit — pagination by updatedAt works.
- Metadata (name, type, searchTerms, source*) lives on `secrets` — stored once.
- Encrypted data + publicKey live on `secret_versions` — per-version.
- Name/type/searchTerms can change per edit — update `secrets` on each edit.

#### Server changes — `vault.server.ts`

**`createVaultEntry`**: insert into `secrets` + `secret_versions` in a
transaction. Set `latestVersionId`.

**`createNewVersion`**: insert into `secret_versions`, update `secrets`
(name, type, searchTerms, updatedAt, latestVersionId).

**`getVaultEntries`**: simple `SELECT FROM secrets WHERE user_id = ?`. Join
with `secret_versions` on `latestVersionId` to get encrypted data + publicKey.

**`getVaultEntry`**: join `secrets` + `secret_versions` by version id.

**`deleteSecret`**: delete from `secrets` (cascade or manual delete of
versions).

**`deleteVersion`**: delete from `secret_versions`. If it was the latest,
update `secrets.latestVersionId` to the previous version. If no versions
remain, delete the secret.

**`getSecretHistory`**: `SELECT FROM secret_versions WHERE secret_id = ?`.

#### Server functions — `vault.functions.ts`

Same API as before — the split is internal. `createEntry`, `updateEntry`,
`deleteEntry`, `deleteSecretFn`, `getHistory` all keep their signatures.

#### Message LEFT JOIN

`message.server.ts` LEFT JOIN changes from `vaultEntries.sourceMessageId` to
`secrets.sourceMessageId`. Returns `secrets.id` as `savedVaultEntryId`.
The detail page URL uses `secrets.latestVersionId` for navigation.

#### UI changes

Minimal — the server functions return the same shape. The detail page loads
from `secret_versions` joined with `secrets`. The `entry` object passed to
`EntryDetail` combines fields from both tables.

#### Verification

1. `bun run db:clear && bun run db:push` — new tables created
2. Create a secret — row in both tables
3. Edit — new version row, secret metadata updated
4. Vault list — no subquery, simple select
5. History — shows all versions
6. Delete version — removes one version, updates latest
7. Delete secret — removes secret + all versions
8. Save from message — secret has sourceMessageId
9. Channel view — "Saved" link still works
10. `bun run lint` — clean
11. `bun run build` — passes
