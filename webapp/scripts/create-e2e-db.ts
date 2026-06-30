import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const url = new URL(databaseUrl);
const database = url.pathname.replace(/^\//, "");

if (!database) {
  throw new Error("DATABASE_URL must include a database name");
}

const allowedE2eDatabases = new Set([
  "keypears_e2e",
  "keypears_e2e_passapples",
]);

if (!allowedE2eDatabases.has(database)) {
  throw new Error(
    `Refusing to create non-E2E database "${database}". Expected one of: ${[...allowedE2eDatabases].join(", ")}.`,
  );
}

const connection = await mysql.createConnection({
  host: url.hostname,
  port: url.port ? Number(url.port) : 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
});

try {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database.replaceAll("`", "``")}\``,
  );
  console.log(`Ensured database ${database} exists`);
} finally {
  await connection.end();
}
