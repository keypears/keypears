import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
} from "drizzle-orm/sqlite-core";

// Vaults table - stores encrypted vault data
export const TableVault = sqliteTable(
  "vault",
  {
    id: text("id").primaryKey(), // Server-generated ULID (no client-side default)
    name: text("name").notNull(), // e.g., "alice"
    domain: text("domain").notNull(), // e.g., "keypears.com"
    encryptedVaultKey: text("encrypted_vault_key").notNull(), // Encrypted 32-byte secp256k1 private key
    vaultPubKeyHash: text("vault_pubkeyhash").notNull(), // 32-byte Blake3 hash of public key
    lastSyncTimestamp: integer("last_sync_timestamp"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    // Unique constraint on name + domain combination (like email addresses)
    unique().on(table.name, table.domain),
  ],
);

export type SelectVault = typeof TableVault.$inferSelect;
export type InsertVault = typeof TableVault.$inferInsert;

// Secret updates table - eventually consistent append-only log
export const TableSecretUpdate = sqliteTable(
  "secret_update",
  {
    // Server-generated fields (immutable once synced)
    id: text("id").primaryKey(), // Server-generated ULID (no client-side default)
    vaultId: text("vault_id")
      .notNull()
      .references(() => TableVault.id, { onDelete: "cascade" }),
    secretId: text("secret_id").notNull(), // Groups all updates for same secret

    // Order numbers for efficient sync (server-generated, immutable)
    globalOrder: integer("global_order").notNull(), // Vault-wide sequential order
    localOrder: integer("local_order").notNull(), // Per-secret sequential order

    // Decrypted fields (client-side only, for querying/indexing)
    name: text("name").notNull(), // Decrypted secret name
    type: text("type").notNull().default("password"), // Secret type
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false), // Tombstone flag

    // Encrypted blob from server (double-encrypted)
    // Server stores this encrypted with vault key
    // Client decrypts to get secret metadata + encrypted password
    encryptedBlob: text("encrypted_blob").notNull(),

    // Timestamps
    createdAt: integer("created_at").notNull(), // Server timestamp
  },
  (table) => [
    // Index for efficient sync polling: "give me all updates since order N"
    index("idx_secret_updates_vault_global_order").on(
      table.vaultId,
      table.globalOrder,
    ),

    // Index for viewing secret history: "give me all updates for this secret"
    index("idx_secret_updates_secret_local_order").on(
      table.secretId,
      table.localOrder,
    ),

    // Indexes for UI queries
    index("idx_secret_updates_name").on(table.name),
    index("idx_secret_updates_type").on(table.type),
  ],
);

export type SelectSecretUpdate = typeof TableSecretUpdate.$inferSelect;
export type InsertSecretUpdate = typeof TableSecretUpdate.$inferInsert;

// Vault sync state table - tracks sync progress for each vault
export const TableVaultSyncState = sqliteTable("vault_sync_state", {
  vaultId: text("vault_id")
    .primaryKey()
    .references(() => TableVault.id, { onDelete: "cascade" }),

  // Last synced order number (client has all updates up to this order)
  lastSyncedGlobalOrder: integer("last_synced_global_order")
    .notNull()
    .default(0),

  // Last sync attempt timestamp
  lastSyncAttempt: integer("last_sync_attempt"),

  // Last successful sync timestamp
  lastSyncSuccess: integer("last_sync_success"),

  // Sync error message (if last sync failed)
  syncError: text("sync_error"),
});

export type SelectVaultSyncState = typeof TableVaultSyncState.$inferSelect;
export type InsertVaultSyncState = typeof TableVaultSyncState.$inferInsert;
