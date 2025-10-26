+++
title = "Drizzle SQLite Database Migrations in Tauri 2.0"
date = "2025-10-04T06:00:00-05:00"
author = "KeyPears Team"
+++

**Note:** KeyPears is a work-in-progress open-source password manager. The
solutions described here are part of our development process and may evolve
before our official release.

## The Problem

Building a local-first application with Tauri 2.0, we needed a robust database
solution for storing encrypted vault data on users' devices. We wanted:

- Type-safe database queries
- Proper schema migrations that work in production
- Pure TypeScript implementation (no Rust for basic DB operations)
- A solution that works across desktop and mobile platforms

After evaluating options, we chose **Drizzle ORM** with **SQLite** via the
official **tauri-plugin-sql**. This combination gives us TypeScript-first
development with the reliability of SQLite.

## The Challenge

Unlike traditional Node.js environments where you have direct filesystem access
and can use drivers like `better-sqlite3`, Tauri's sandboxed environment
requires a different approach. Drizzle's standard migration tools assume direct
database access, but with Tauri, we need to go through the plugin system.

Here's how we solved it.

## Tech Stack

- **Tauri 2.0** - Cross-platform app framework
- **Drizzle ORM** - TypeScript ORM
- **drizzle-kit** - Schema migration generator
- **@tauri-apps/plugin-sql** - Official Tauri SQLite plugin
- **React Router** - For app routing and loaders

## Step 1: Install Dependencies

First, add the necessary packages:

```bash
# Production dependencies
pnpm add drizzle-orm @tauri-apps/plugin-sql

# Development dependencies
pnpm add -D drizzle-kit
```

Then add the Tauri plugin to your Rust dependencies in `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

## Step 2: Configure Tauri Permissions

Tauri 2.0 requires explicit permission grants. Add SQL permissions to
`src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "sql:default",
    "sql:allow-load",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-close"
  ]
}
```

Without these permissions, you'll get "not allowed" errors when trying to access
the database.

## Step 3: Define Your Schema

Create your Drizzle schema at `app/db/schema.ts`:

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const vaults = sqliteTable("vaults", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});
```

## Step 4: Set Up the SQLite Proxy

Since we can't use standard SQLite drivers in Tauri, we use Drizzle's
`sqlite-proxy` adapter. Create `app/db/index.ts`:

```typescript
import { drizzle } from "drizzle-orm/sqlite-proxy";
import Database from "@tauri-apps/plugin-sql";
import * as schema from "./schema";

export async function getDb() {
  return await Database.load("sqlite:keypears.db");
}

function isSelectQuery(sql: string): boolean {
  return sql.trim().toLowerCase().startsWith("select");
}

export const db = drizzle<typeof schema>(
  async (sql, params, method) => {
    const sqlite = await getDb();
    let rows: any = [];

    if (isSelectQuery(sql)) {
      rows = await sqlite.select(sql, params).catch((e) => {
        console.error("SQL Error:", e);
        return [];
      });
    } else {
      rows = await sqlite.execute(sql, params).catch((e) => {
        console.error("SQL Error:", e);
        return [];
      });
      return { rows: [] };
    }

    rows = rows.map((row: any) => Object.values(row));
    const results = method === "all" ? rows : rows[0];
    await sqlite.close();
    return { rows: results };
  },
  { schema: schema, logger: true }
);
```

The proxy adapter translates Drizzle queries into calls to the Tauri SQL plugin.

## Step 5: Configure Migration Generation

Create `drizzle.config.ts`:

```typescript
import type { Config } from "drizzle-kit";

export default {
  schema: "./app/db/schema.ts",
  out: "./app/db/migrations",
  dialect: "sqlite",
} satisfies Config;
```

Add a script to `package.json`:

```json
{
  "scripts": {
    "db:migrate": "drizzle-kit generate"
  }
}
```

## Step 6: Implement Migration Runner

Here's the key part - implementing our own migration system. Create
`app/db/migrate.ts`:

```typescript
import { getDb } from "./index";

// Dynamically import all SQL migration files
const migrationFiles = import.meta.glob<string>("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Create migrations tracking table
async function ensureMigrationsTable() {
  const sqlite = await getDb();
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `);
  await sqlite.close();
}

// Get list of applied migrations
async function getAppliedMigrations(): Promise<string[]> {
  const sqlite = await getDb();
  const rows = await sqlite
    .select<Array<{ hash: string }>>(
      "SELECT hash FROM __drizzle_migrations ORDER BY id"
    )
    .catch(() => []);
  await sqlite.close();
  return rows.map((row) => row.hash);
}

// Record migration as applied
async function recordMigration(hash: string) {
  const sqlite = await getDb();
  const timestamp = Date.now();
  await sqlite.execute(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    [hash, timestamp]
  );
  await sqlite.close();
}

// Execute SQL file
async function executeSqlFile(sqlContent: string) {
  const sqlite = await getDb();
  const statements = sqlContent
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await sqlite.execute(statement).catch((e) => {
      console.error("Migration error:", e);
      throw e;
    });
  }

  await sqlite.close();
}

export async function runMigrations() {
  console.log("Running database migrations...");

  try {
    await ensureMigrationsTable();
    const appliedMigrations = await getAppliedMigrations();

    const migrationPaths = Object.keys(migrationFiles).sort();

    const pendingMigrations = migrationPaths.filter((path) => {
      const filename = path.split("/").pop() || path;
      return !appliedMigrations.includes(filename);
    });

    if (pendingMigrations.length === 0) {
      console.log("All migrations already applied");
      return;
    }

    for (const path of pendingMigrations) {
      const filename = path.split("/").pop() || path;
      const migrationContent = migrationFiles[path];

      console.log(`Executing migration: ${filename}`);
      await executeSqlFile(migrationContent);
      await recordMigration(filename);
      console.log(`✓ Applied: ${filename}`);
    }

    console.log(`Successfully completed ${pendingMigrations.length} migration(s)`);
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}
```

This implements Drizzle's migration tracking pattern:

- Uses `__drizzle_migrations` table to track applied migrations
- Only runs new migrations on subsequent app launches
- Supports incremental migrations as your schema evolves

## Step 7: Run Migrations on App Startup

In your root component (`app/root.tsx`), use a clientLoader to run migrations
before rendering:

```typescript
import { runMigrations } from "./db/migrate";

export async function clientLoader() {
  await runMigrations();
  return null;
}

export function HydrateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <h1>Migrating the database...</h1>
    </div>
  );
}
```

React Router will show the fallback while migrations run, ensuring the database
is ready before any component renders.

## Step 8: Create Model Functions

With everything set up, create type-safe model functions at
`app/db/models/vault.ts`:

```typescript
import { db } from "../index";
import { vaults } from "../schema";
import { eq, count } from "drizzle-orm";

export interface Vault {
  id: number;
  name: string;
}

export async function createVault(name: string): Promise<Vault> {
  const result = await db.insert(vaults).values({ name }).returning();
  return result[0];
}

export async function getVault(id: number): Promise<Vault | undefined> {
  const result = await db.select().from(vaults).where(eq(vaults.id, id));
  return result[0];
}

export async function getVaults(): Promise<Vault[]> {
  return await db.select().from(vaults);
}

export async function countVaults(): Promise<number> {
  const result = await db.select({ count: count() }).from(vaults);
  return result[0]?.count ?? 0;
}
```

## Usage Workflow

### Development

When you modify your schema:

```bash
# 1. Update app/db/schema.ts
# 2. Generate new migration
pnpm run db:migrate

# 3. Restart app - migration runs automatically
```

During development, you can safely delete all migrations and regenerate them
from scratch. Just delete the database file and migration files, then
regenerate.

### Production

Before releasing v1.0:

1. Delete all development migrations
2. Generate one clean migration from your final schema
3. Commit this as your baseline

After release, **never delete migrations** - only add new ones. Users will have
the old migrations applied, and new migrations build incrementally.

## Database File Location

The Tauri SQL plugin creates the database in the app's data directory:

- **macOS**: `~/Library/Application Support/{app-identifier}/keypears.db`
- **Linux**: `~/.local/share/{app-identifier}/keypears.db`
- **Windows**: `%APPDATA%\{app-identifier}\keypears.db`

## Troubleshooting

**Permission errors**: Make sure you've added all SQL permissions to
`capabilities/default.json`

**Migration fails**: Check browser console in the Tauri webview for detailed
error messages

**Type errors**: Run `pnpm run typecheck` to catch issues before runtime

## Conclusion

This setup gives us:

- ✅ Type-safe database queries with Drizzle
- ✅ Proper migration tracking that works in production
- ✅ Pure TypeScript - no Rust code needed for basic operations
- ✅ Cross-platform compatibility (desktop & mobile)
- ✅ Incremental migrations as the schema evolves

The combination of Drizzle's `sqlite-proxy` adapter with Tauri's SQL plugin
provides a robust foundation for local-first data storage. While we had to
implement our own migration runner, we followed Drizzle's patterns to ensure
compatibility and maintainability.

## Resources

- [Drizzle ORM](https://orm.drizzle.team/)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/)
- [Tauri Capabilities](https://v2.tauri.app/security/capabilities/)
