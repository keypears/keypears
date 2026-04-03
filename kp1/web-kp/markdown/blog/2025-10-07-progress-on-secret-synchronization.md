+++
title = "Progress on Secret Synchronization: A Future-Proof Schema"
date = "2025-10-07T06:00:00-05:00"
author = "KeyPears Team"
+++

**Note:** KeyPears is a work-in-progress open-source password manager. The
design decisions described here represent our development approach and may
evolve before our official release.

We've made significant progress on KeyPears' secret synchronization
architecture. Today we're sharing how we redesigned our schema to support
diverse secret types while maintaining the small-sync-unit principle that makes
our synchronization protocol efficient and reliable.

## The Problem

Our original schema was built around passwords. It had fields like
`encryptedPassword`, `username`, `domain`, and `notes`. This worked fine for
basic password management, but it created limitations:

- **Type inflexibility**: How do you store an API key? A cryptocurrency wallet
  with multiple components? Environment variables?
- **No grouping**: Secrets existed in isolation. There was no way to represent
  "this API token belongs to this account" or "these 20 environment variables
  form one .env file"
- **No hierarchy**: No folders, no organization beyond a flat list
- **KeePass import impossible**: KeePass has groups (folders) and custom fields
  (additional key-value pairs per entry). We couldn't represent either.

We needed a more flexible schema without abandoning our core architectural
principle: **every secret must sync independently** to keep network overhead
small and conflict resolution simple.

## The Solution: Three Changes

We evolved the `SecretUpdate` schema with three key additions: multi-type
support, dual hierarchy mechanisms, and JSON-based storage.

### 1. Multi-Type Support

First, we made the schema generic enough to handle any small secret:

```typescript
type: "password" | "envvar" | "apikey" | "walletkey" | "passkey";
encryptedData: string; // Previously: encryptedPassword
encryptedNotes: string; // Previously: notes
```

The `type` field distinguishes what kind of secret this is. The generic
`encryptedData` field holds the actual secret value (password, API key, private
key, etc.). Password-specific fields like `domain`, `username`, and `email`
remain in the schema but are optional—used primarily when `type` is `password`.

This small change opens up KeyPears to handle:

- **Environment variables**: Type `envvar`, name `DATABASE_URL`, encrypted value
  in `encryptedData`
- **API keys**: Type `apikey`, service name in a `label` field, key in
  `encryptedData`
- **Wallet keys**: Type `walletkey`, blockchain type in metadata, private key in
  `encryptedData`
- **Passkeys**: Type `passkey`, credential ID and public key in metadata,
  private key in `encryptedData`

### 2. Dual Hierarchy: Folders and ParentId

The second change introduces two different hierarchy mechanisms, each serving a
specific purpose:

```typescript
folders: string[]      // ["Work", "Projects", "Client A"]
tags: string[]         // ["production", "critical"]
parentId: string       // ULID of parent secret (max depth 1)
```

**Folders** provide unlimited-depth organizational hierarchy. They're just an
array of strings representing the path:

```typescript
folders: ["Work", "AWS", "Production"];
folders: ["Personal", "Banking"];
folders: []; // Root level
```

This maps perfectly to KeePass Groups and lets users organize thousands of
secrets into a familiar folder structure.

**Tags** provide orthogonal categorization. A secret can have multiple tags for
cross-cutting concerns:

```typescript
tags: ["production-env", "requires-rotation", "shared-with-team"];
```

**ParentId** creates actual parent-child relationships between secrets. This is
where it gets interesting.

## ParentId: Secrets Containing Secrets

The `parentId` field lets one secret "contain" other secrets. A simple example:

```typescript
// Parent: The main account
{
  secretId: "abc123",
  name: "GitHub Account",
  type: "password",
  encryptedData: "<main password>"
}

// Child: API token for the same account
{
  secretId: "def456",
  name: "API Token",
  type: "apikey",
  parentId: "abc123",
  encryptedData: "<token>"
}
```

This models KeePass's custom fields—additional key-value pairs that belong to an
entry. In KeePass, you might have a GitHub entry with standard fields (username,
password, URL) plus custom fields for API tokens, 2FA backup codes, or recovery
emails.

In KeyPears, each custom field becomes its own secret with a `parentId` pointing
to the parent. Each syncs independently (small sync units!), but they're
logically grouped.

### The Depth Limit: Security Through Simplicity

Here's the critical constraint: **a secret can have a parent, but that parent
cannot have a parent**. Maximum depth is 1. No grandparents allowed.

Why? Three reasons:

**1. Security**: Client-generated IDs open an attack vector for malicious
clients creating circular references or extremely deep chains. With depth=1, the
validation is trivial:

```typescript
async function validateParentChain(secretId: string, parentId?: string) {
  if (!parentId) return; // No parent, valid
  if (parentId === secretId) throw new Error("Cannot self-reference");

  const parent = await getSecretHistory(parentId);
  if (parent.length > 0 && parent[0].parentId) {
    throw new Error("Cannot nest more than one level deep");
  }
}
```

One database lookup. No recursion. No visited sets. O(1) validation that
attackers can't exploit.

**2. Performance**: Validating unlimited depth requires recursive queries.
Validating depth=1 requires one query. Simple.

**3. Sufficient for real use cases**:

- Folder with secrets ✓
- Entry with custom fields ✓
- Environment variable group ✓

What we lose: deeply nested folder hierarchies via `parentId`. But we have
`folders` for that! The two mechanisms complement each other perfectly.

## Why Two Hierarchy Systems?

It might seem redundant to have both `folders` and `parentId`, but they serve
different purposes:

**Folders** are for **organizational hierarchy**. They map to KeePass Groups.
They're pure metadata—just strings representing a path. They have unlimited
depth because they're just labels, not database relationships.

**ParentId** is for **data relationships**. It maps to KeePass custom fields. It
creates actual parent-child relationships where one secret logically contains
others. Each child syncs independently, maintaining small sync units.

Together, they enable full KeePass import:

```typescript
// KeePass structure:
// Work/Projects/GitHub (Group path)
//   - GitHub Account (Entry)
//     - Username: alice
//     - Password: ••••••
//     - Custom: API Token (protected)
//     - Custom: 2FA Codes (protected)

// KeyPears representation:
{
  secretId: "main",
  name: "GitHub Account",
  type: "password",
  folders: ["Work", "Projects", "GitHub"],
  username: "alice",
  encryptedData: "<password>"
}
{
  secretId: "token",
  name: "API Token",
  type: "apikey",
  folders: ["Work", "Projects", "GitHub"], // Inherits folder
  parentId: "main",
  encryptedData: "<token>"
}
{
  secretId: "codes",
  name: "2FA Codes",
  type: "password",
  folders: ["Work", "Projects", "GitHub"],
  parentId: "main",
  encryptedData: "<codes>"
}
```

The folder path provides organization. The `parentId` relationships show which
secrets belong together. Each secret syncs independently.

## JSON-Based Storage: Migration-Proof Architecture

The third major change is how we store secrets in the database. We moved to a
hybrid approach:

```sql
CREATE TABLE secret_update (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  secret_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'password',
  parent_id TEXT,
  created_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,

  -- Source of truth: full JSON object
  secret_update_json TEXT NOT NULL
);

CREATE INDEX idx_secret_updates_name ON secret_update(name);
CREATE INDEX idx_secret_updates_type ON secret_update(type);
CREATE INDEX idx_secret_updates_parent_id ON secret_update(parent_id);
```

Notice what's happening here. We store the **entire `SecretUpdate` object** as
JSON in `secret_update_json`. The other columns (`name`, `type`, `parent_id`,
etc.) are duplicates of data from the JSON, extracted for indexing.

The JSON is the source of truth. The columns are for performance.

### Why This Approach?

**Adding fields requires no migration**. Want to add a `label` field? Update the
Zod schema, start writing it to the JSON, and you're done. The database doesn't
care—it's just storing JSON.

When we added `parentId` to the schema, we:

1. Updated the Zod schema in TypeScript
2. Added `parent_id` column to the database (for indexing)
3. Started serializing `parentId` to the JSON

Users with existing vaults see `parentId: undefined` in their JSON. No
migration, no data transformation. Just works.

This architecture is **future-proof**. We can evolve the schema rapidly during
development without worrying about breaking existing databases.

### When We Ship v1.0

Before our first production release, we'll generate one clean migration from the
final schema. That becomes our baseline. After that, we'll only add new
migrations—never delete old ones—because users will have the old migrations
applied.

But during development? We delete and regenerate migrations freely. The JSON
storage strategy makes this painless.

## What This Enables

With these changes in place, KeyPears can now handle:

### KeePass Import (Future Feature)

Full KeePass `.kdbx` import support, including:

- Nested groups → `folders` array
- Entries → secrets with `type: "password"`
- Custom protected fields → child secrets with `parentId`
- Entry metadata → password-specific fields

The only thing we won't import: file attachments. By design. We're optimizing
for small secrets that sync efficiently.

### Environment Variables

Create a parent secret "Production Environment" and attach child secrets for
each variable:

```typescript
{ name: "Production Env", type: "folder" }  // Parent
{ name: "DATABASE_URL", type: "envvar", parentId: "..." }
{ name: "API_SECRET", type: "envvar", parentId: "..." }
{ name: "STRIPE_KEY", type: "envvar", parentId: "..." }
```

Or use tags instead:

```typescript
{ name: "DATABASE_URL", type: "envvar", tags: ["prod-env"] }
{ name: "API_SECRET", type: "envvar", tags: ["prod-env"] }
```

Both approaches work. `parentId` creates explicit grouping. Tags create implicit
sets.

### Cryptocurrency Wallets

Store wallet keys with relevant metadata:

```typescript
{
  name: "Ethereum Main Wallet",
  type: "walletkey",
  encryptedData: "<private key>",
  folders: ["Crypto", "Ethereum"],
  tags: ["high-value", "cold-storage"]
}
```

### API Keys with Secrets

Store API key pairs as parent-child:

```typescript
{ name: "Stripe", type: "apikey", encryptedData: "<public key>" }
{ name: "Secret Key", type: "apikey", parentId: "...", encryptedData: "<secret>" }
```

## Synchronization Properties

These changes maintain our core synchronization principles:

**Small sync units**: Each secret syncs independently. A 50-entry KeePass import
becomes 50 individual secrets, each a few hundred bytes. If two users edit
different entries, no conflicts.

**Atomic updates**: Each `SecretUpdate` is immutable once created. Updates
create new records in an append-only log. The latest update wins
(last-write-wins conflict resolution).

**Efficient**: Only changed secrets sync. If you update one child secret, you
sync one small object, not the entire parent-child group.

**Validated**: The `parentId` depth limit prevents malicious clients from
creating expensive recursive structures.

## Looking Ahead

This schema evolution lays the groundwork for several future features:

- **UI for child secrets**: Show "API Token" nested under "GitHub Account" in
  the secret list
- **KeePass import**: Full `.kdbx` file import with groups and custom fields
- **Environment variable templates**: Quick creation of common .env structures
- **Bulk operations**: Delete/restore an entire group by operating on all
  children

The foundation is solid. The architecture is flexible. The sync protocol remains
simple and efficient.

We're building KeyPears to be more than a password manager—it's a secure,
self-custodied secret manager that handles everything from passwords to
environment variables to cryptocurrency keys. And it all syncs seamlessly across
your devices without trusting a central authority with your encryption keys.

## Technical Details

For those interested in the implementation:

- **Schema definition**: Zod validation in TypeScript, ensuring type safety
- **Database**: SQLite via Drizzle ORM with the sqlite-proxy adapter
- **Migration**: Custom migration runner that tracks applied migrations
- **Validation**: O(1) parent chain validation with single database lookup
- **Indexes**: `name`, `type`, `parent_id`, and composite
  `vault_id + secret_id + created_at`

The code is Apache 2.0 licensed and available on GitHub. We're building in the
open, one commit at a time.

More updates coming soon.
