import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL!,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  idleTimeout: 8 * 60 * 60 * 1000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// Force UTC timezone on every connection
pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

export const db = drizzle(pool, { schema, mode: "default" });
