import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";
import { ulid } from "ulid";

// Vaults table - stores encrypted vault data
export const TableVault = sqliteTable(
  "vault",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => ulid()),
    name: text("name").notNull(), // e.g., "alice"
    domain: text("domain").notNull(), // e.g., "keypears.com"
    encryptedPasswordKey: text("encrypted_password_key").notNull(),
    lastSyncTimestamp: integer("last_sync_timestamp"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    // Unique constraint on name + domain combination (like email addresses)
    uniqueNameDomain: unique().on(table.name, table.domain),
  }),
);

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
  ],
);

export type SelectSecretUpdate = typeof TableSecretUpdate.$inferSelect;
export type InsertSecretUpdate = typeof TableSecretUpdate.$inferInsert;
