import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { ulid } from "ulid";

// Vaults table - stores encrypted vault data
export const TableVault = sqliteTable("vault", {
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

export type SelectVault = typeof TableVault.$inferSelect;
export type InsertVault = typeof TableVault.$inferInsert;

// Secret updates table - eventually consistent append-only log
export const TableSecretUpdate = sqliteTable(
  "secret_update",
  {
    // Query/index columns (duplicated from JSON for performance)
    id: text("id")
      .primaryKey()
      .$defaultFn(() => ulid()),
    vaultId: text("vault_id")
      .notNull()
      .references(() => TableVault.id, { onDelete: "cascade" }),
    secretId: text("secret_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull().default("password"),
    parentId: text("parent_id"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),

    // Source of truth - full JSON object
    secretUpdateJson: text("secret_update_json").notNull(),
  },
  (table) => [
    index("idx_secret_updates_vault_secret_time").on(
      table.vaultId,
      table.secretId,
      table.createdAt,
    ),
    index("idx_secret_updates_name").on(table.name),
    index("idx_secret_updates_type").on(table.type),
    index("idx_secret_updates_parent_id").on(table.parentId),
  ],
);

export type SelectSecretUpdate = typeof TableSecretUpdate.$inferSelect;
export type InsertSecretUpdate = typeof TableSecretUpdate.$inferInsert;
