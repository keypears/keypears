import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import * as schema from "./schema";

// Memoized database instances
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedDb: any = null;
let cachedSqlite: Database | null = null;
let resolvedDbPath: string | null = null;

function isSelectQuery(sql: string): boolean {
  return sql.trim().toLowerCase().startsWith("select");
}

// Get database path from Rust (either custom via --db-path or default)
async function getDbPath(): Promise<string> {
  if (resolvedDbPath) {
    return resolvedDbPath;
  }

  try {
    const customPath = await invoke<string>("get_db_path");
    if (customPath && customPath.trim() !== "") {
      resolvedDbPath = `sqlite:${customPath}`;
    } else {
      resolvedDbPath = "sqlite:keypears.db";
    }
  } catch (error) {
    console.error("Failed to get db path from Rust:", error);
    resolvedDbPath = "sqlite:keypears.db";
  }

  return resolvedDbPath;
}

// Export function to get the resolved database path for display
export function getResolvedDbPath(): string | null {
  return resolvedDbPath;
}

// Initialize database - accepts optional override for testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initDb(dbOverride?: any) {
  // If override provided, use it and cache it
  if (dbOverride) {
    cachedDb = dbOverride;
    return cachedDb;
  }

  // Return cached instance if already initialized
  if (cachedDb) {
    return cachedDb;
  }

  // Get database path from Rust
  const dbPath = await getDbPath();

  // Create Tauri proxy database for production
  cachedDb = drizzle<typeof schema>(
    async (sql, params, method) => {
      // Load sqlite connection once and cache it
      if (!cachedSqlite) {
        cachedSqlite = await Database.load(dbPath);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows: any = [];
      let results = [];

      // If the query is a SELECT, use the select method
      if (isSelectQuery(sql)) {
        rows = await cachedSqlite.select(sql, params).catch((e) => {
          console.error("SQL Error:", e);
          return [];
        });
      } else {
        // Otherwise, use the execute method
        rows = await cachedSqlite.execute(sql, params).catch((e) => {
          console.error("SQL Error:", e);
          return [];
        });
        return { rows: [] };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows = rows.map((row: any) => {
        return Object.values(row);
      });

      // If the method is "all", return all rows
      results = method === "all" ? rows : rows[0];
      return { rows: results };
    },
    // Pass the schema to the drizzle instance
    { schema, logger: true },
  );

  return cachedDb;
}

// Export raw Tauri database for migrations
export async function getDb() {
  if (!cachedSqlite) {
    const dbPath = await getDbPath();
    cachedSqlite = await Database.load(dbPath);
  }
  return cachedSqlite;
}

// Export default database instance with production type for type safety
// Must call initDb() before using db
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: SqliteRemoteDatabase<typeof schema> = new Proxy({} as any, {
  get(_target, prop) {
    if (!cachedDb) {
      throw new Error(
        "Database not initialized. Call await initDb() before accessing db.",
      );
    }
    return cachedDb[prop];
  },
});
