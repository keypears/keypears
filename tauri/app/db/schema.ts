import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ulid } from "ulid";
import { z } from "zod";

// Zod schema for vault name validation
export const vaultNameSchema = z
  .string()
  .min(3, "Vault name must be at least 3 characters")
  .max(20, "Vault name must be at most 20 characters")
  .regex(/^[a-zA-Z]/, "Vault name must start with a letter")
  .regex(
    /^[a-zA-Z0-9]+$/,
    "Vault name must contain only alphanumeric characters",
  );

// Vaults table - stores encrypted vault data
export const vaults = sqliteTable("vaults", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => ulid()),
  name: text("name").notNull().unique(),
  // TODO: Add fields for encrypted vault key, metadata, timestamps, etc.
});
