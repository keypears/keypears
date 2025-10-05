import { getDb } from "./index";

// Dynamically import all SQL migration files
const migrationFiles = import.meta.glob<string>("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Ensure the migrations tracking table exists
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

// Get list of already applied migrations
async function getAppliedMigrations(): Promise<string[]> {
  const sqlite = await getDb();
  const rows = await sqlite
    .select<
      Array<{ hash: string }>
    >("SELECT hash FROM __drizzle_migrations ORDER BY id")
    .catch(() => []);
  await sqlite.close();
  return rows.map((row: { hash: string }) => row.hash);
}

// Record a migration as applied
async function recordMigration(hash: string) {
  const sqlite = await getDb();
  const timestamp = Date.now();
  await sqlite.execute(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    [hash, timestamp],
  );
  await sqlite.close();
}

async function executeSqlFile(sqlContent: string) {
  const sqlite = await getDb();
  const statements = sqlContent
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await sqlite.execute(statement).catch((e: unknown) => {
      console.error("Migration error:", e);
      throw e;
    });
  }

  await sqlite.close();
}

export async function runMigrations() {
  console.log("Running database migrations...");

  try {
    // Ensure the migrations tracking table exists
    await ensureMigrationsTable();

    // Get list of already applied migrations
    const appliedMigrations = await getAppliedMigrations();
    console.log(
      `Found ${appliedMigrations.length} previously applied migration(s)`,
    );

    // Get all migration files and sort them by filename (ensures order)
    const migrationPaths = Object.keys(migrationFiles).sort();

    if (migrationPaths.length === 0) {
      console.log("No migrations found");
      return;
    }

    // Filter out already applied migrations
    const pendingMigrations = migrationPaths.filter((path) => {
      // Extract filename from path (e.g., "./migrations/0000_curvy_ravenous.sql" -> "0000_curvy_ravenous.sql")
      const filename = path.split("/").pop() || path;
      return !appliedMigrations.includes(filename);
    });

    if (pendingMigrations.length === 0) {
      console.log("All migrations already applied, nothing to do");
      return;
    }

    console.log(`Applying ${pendingMigrations.length} new migration(s)`);

    // Execute each pending migration in order
    for (const path of pendingMigrations) {
      const filename = path.split("/").pop() || path;
      const migrationContent = migrationFiles[path];

      console.log(`Executing migration: ${filename}`);
      await executeSqlFile(migrationContent);

      // Record the migration as applied
      await recordMigration(filename);
      console.log(`✓ Applied: ${filename}`);
    }

    console.log(
      `Successfully completed ${pendingMigrations.length} migration(s)`,
    );
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}
