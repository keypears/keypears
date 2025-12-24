import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://keypears:keypears_dev@localhost:4275/keypears",
});

// Create Drizzle instance with schema
export const db = drizzle({ client: pool, schema });
