import { drizzle } from "drizzle-orm/better-sqlite3";
import BetterSqlite from "better-sqlite3";
import * as schema from "~app/db/schema";
import { initDb } from "~app/db/index";
import fs from "fs";
import path from "path";

// Cached test database instance
let testDb: ReturnType<typeof drizzle> | null = null;
let testSqliteDb: BetterSqlite.Database | null = null;

// Run migrations on the test database
function runMigrations(sqliteDb: BetterSqlite.Database) {
  const migrationsDir = path.join(__dirname, "../../app/db/migrations");

  if (!fs.existsSync(migrationsDir)) {
    throw new Error("Migrations directory not found");
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf-8");

    // Split by statement-breakpoint and execute each statement
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      sqliteDb.exec(statement);
    }
  }
}

// Initialize test database with migrations and inject into app
export function initTestDb() {
  // Return cached instance if already initialized
  if (testDb) {
    return testDb;
  }

  // Create better-sqlite3 in-memory database
  testSqliteDb = new BetterSqlite(":memory:");
  testDb = drizzle(testSqliteDb, { schema, logger: true });

  // Run migrations
  runMigrations(testSqliteDb);

  // Inject test database into app/db/index.ts
  initDb(testDb);

  return testDb;
}

// Reset test database by deleting all data
export function resetTestDb() {
  if (!testSqliteDb) {
    throw new Error("Test database not initialized. Call initTestDb() first.");
  }

  // Get all table names
  const tables = testSqliteDb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%'",
    )
    .all() as Array<{ name: string }>;

  // Delete all rows from each table
  for (const table of tables) {
    testSqliteDb.exec(`DELETE FROM ${table.name}`);
  }
}

// Close test database
export function closeTestDb() {
  if (testSqliteDb) {
    testSqliteDb.close();
    testSqliteDb = null;
    testDb = null;
  }
}
