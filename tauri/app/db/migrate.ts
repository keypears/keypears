import { getDb } from "./index";

// Dynamically import all SQL migration files
const migrationFiles = import.meta.glob<string>("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

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
    // Get all migration files and sort them by filename (ensures order)
    const migrationPaths = Object.keys(migrationFiles).sort();

    if (migrationPaths.length === 0) {
      console.log("No migrations found");
      return;
    }

    // Execute each migration in order
    for (const path of migrationPaths) {
      const migrationContent = migrationFiles[path];
      console.log(`Executing migration: ${path}`);
      await executeSqlFile(migrationContent);
    }

    console.log(`Completed ${migrationPaths.length} migration(s)`);
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}
