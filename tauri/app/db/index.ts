import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import Database from "@tauri-apps/plugin-sql";
import * as schema from "./schema";

// Memoized database instances
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedDb: any = null;
let cachedSqlite: Database | null = null;

function isSelectQuery(sql: string): boolean {
  return sql.trim().toLowerCase().startsWith("select");
}

// Initialize database - accepts optional override for testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initDb(dbOverride?: any) {
  // If override provided, use it and cache it
  if (dbOverride) {
    cachedDb = dbOverride;
    return cachedDb;
  }

  // Return cached instance if already initialized
  if (cachedDb) {
    return cachedDb;
  }

  // Create Tauri proxy database for production
  cachedDb = drizzle<typeof schema>(
    async (sql, params, method) => {
      // Load sqlite connection once and cache it
      if (!cachedSqlite) {
        cachedSqlite = await Database.load("sqlite:keypears.db");
      }

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

      rows = rows.map((row: any) => {
        return Object.values(row);
      });

      // If the method is "all", return all rows
      results = method === "all" ? rows : rows[0];
      return { rows: results };
    },
    // Pass the schema to the drizzle instance
    { schema: schema, logger: true },
  );

  return cachedDb;
}

// Export raw Tauri database for migrations
export async function getDb() {
  if (!cachedSqlite) {
    cachedSqlite = await Database.load("sqlite:keypears.db");
  }
  return cachedSqlite;
}

// Export default database instance with production type for type safety
// Lazy initialization: db is initialized on first access, allowing tests to inject first
// Both drivers have compatible runtime APIs, but we type based on production
export const db: SqliteRemoteDatabase<typeof schema> = new Proxy({} as any, {
  get(_target, prop) {
    const instance = initDb();
    return instance[prop];
  },
});
