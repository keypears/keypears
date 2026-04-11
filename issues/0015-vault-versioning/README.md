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
