import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
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

// Password updates table - eventually consistent append-only log
export const passwordUpdates = sqliteTable(
  "password_updates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => ulid()),
    vaultId: text("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    secretId: text("secret_id").notNull(),
    name: text("name").notNull(),
    domain: text("domain"),
    username: text("username"),
    email: text("email"),
    notes: text("notes"),
    encryptedPassword: text("encrypted_password"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    index("idx_password_updates_vault_secret_time").on(
      table.vaultId,
      table.secretId,
      table.createdAt,
    ),
  ],
);
