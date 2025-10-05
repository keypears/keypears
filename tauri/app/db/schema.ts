import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { ulid } from "ulid";

// Vaults table - stores encrypted vault data
export const vaults = sqliteTable("vaults", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => ulid()),
  name: text("name").notNull().unique(),
  encryptedVaultKey: text("encrypted_vault_key").notNull(),
  hashedVaultKey: text("hashed_vault_key").notNull(),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});
