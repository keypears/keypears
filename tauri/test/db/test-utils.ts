import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "~app/db/schema";
import fs from "fs";
import path from "path";

let testDb: Database.Database | null = null;
let testDrizzle: ReturnType<typeof drizzle> | null = null;

export function getTestDb() {
  if (!testDb) {
    // Create in-memory SQLite database
    testDb = new Database(":memory:");
    testDrizzle = drizzle(testDb, { schema });

    // Run migrations
    runTestMigrations();
  }

  return { db: testDb, drizzle: testDrizzle! };
}

function runTestMigrations() {
  if (!testDb) return;

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
      testDb.exec(statement);
    }
  }
}

export function resetTestDb() {
  if (!testDb) return;

  // Get all table names
  const tables = testDb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%'"
    )
    .all() as Array<{ name: string }>;

  // Delete all rows from each table
  for (const table of tables) {
    testDb.exec(`DELETE FROM ${table.name}`);
  }
}

export function closeTestDb() {
  if (testDb) {
    testDb.close();
    testDb = null;
    testDrizzle = null;
  }
}
