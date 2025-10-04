import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Vaults table - stores encrypted vault data
export const vaults = sqliteTable("vaults", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  // TODO: Add fields for encrypted vault key, metadata, timestamps, etc.
});
