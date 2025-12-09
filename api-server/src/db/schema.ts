import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const TableVault = pgTable(
  'vault',
  {
    // Primary key - ULID for time-ordered, collision-resistant IDs
    id: varchar('id', { length: 26 }).primaryKey(),

    // Vault name (1-30 characters, alphanumeric, starts with letter)
    name: varchar('name', { length: 30 }).notNull(),

    // Domain (e.g., "keypears.com", "hevybags.com", "wokerium.com")
    domain: varchar('domain', { length: 255 }).notNull(),

    // Vault public key hash (pubkeyhash) - 32-byte Blake3 hash of the vault's public key
    // This is the vault's public identity, similar to Bitcoin addresses
    // Used for vault lookup and future DH key exchange protocol
    // Primary public key is NEVER exposed - only relationship-specific derived keys
    vaultPubKeyHash: varchar('vault_pubkeyhash', { length: 64 }).notNull(), // Blake3 hex = 64 chars

    // Hashed login key - server stores KDF of the login key for authentication
    // Client derives: password → password key (100k rounds) → login key (100k rounds)
    // Client sends: login key (unhashed) to server via HTTPS
    // Server derives: hashed login key (100k rounds KDF)
    // Server stores: hashed login key for verification
    // This is what the server checks to verify the user knows the password
    // Server CANNOT derive the password key or encryption key from this
    hashedLoginKey: varchar('hashed_login_key', { length: 64 }).notNull(), // Blake3 hex = 64 chars

    // Encrypted vault key - stored on server for cross-device import
    // Encrypted with encryption key derived from password
    // Allows importing vault on new device by entering password
    encryptedVaultKey: text('encrypted_vault_key').notNull(),

    // Last sync timestamp (Unix milliseconds)
    lastSyncTimestamp: bigint('last_sync_timestamp', { mode: 'number' }),

    // Timestamps for auditing
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ([
    // Unique constraint on name + domain combination (like email addresses)
    unique().on(table.name, table.domain),
  ]),
);

export type SelectVault = typeof TableVault.$inferSelect;
export type InsertVault = typeof TableVault.$inferInsert;

// Secret updates table - append-only immutable log of all secret changes
export const TableSecretUpdate = pgTable(
  'secret_update',
  {
    // Primary key - ULID for time-ordered, collision-resistant IDs
    id: varchar('id', { length: 26 }).primaryKey(),

    // Foreign keys
    vaultId: varchar('vault_id', { length: 26 })
      .notNull()
      .references(() => TableVault.id, { onDelete: 'cascade' }),

    // Secret identifier - groups all updates for the same secret
    secretId: varchar('secret_id', { length: 26 }).notNull(),

    // Order numbers for efficient sync polling
    // globalOrder: vault-wide sequential order (1, 2, 3, ...)
    // localOrder: per-secret sequential order (1, 2, 3, ...)
    globalOrder: bigint('global_order', { mode: 'number' }).notNull(),
    localOrder: integer('local_order').notNull(),

    // Encrypted blob - contains all secret metadata + encrypted password
    // Client encrypts entire secret update (name, username, encryptedPassword, etc.)
    // Server only sees: ID, vault_id, secret_id, order numbers, this blob
    encryptedBlob: text('encrypted_blob').notNull(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ([
    // Index for efficient polling: "give me all updates since order N"
    index('idx_vault_global_order').on(table.vaultId, table.globalOrder),

    // Index for viewing secret history: "give me all updates for this secret"
    index('idx_secret_local_order').on(table.secretId, table.localOrder),

    // Ensure global order is unique per vault
    unique().on(table.vaultId, table.globalOrder),
  ]),
);

export type SelectSecretUpdate = typeof TableSecretUpdate.$inferSelect;
export type InsertSecretUpdate = typeof TableSecretUpdate.$inferInsert;

// Device sessions table - tracks active sessions for devices accessing vaults
export const TableDeviceSession = pgTable(
  'device_session',
  {
    // Primary key - ULID
    id: varchar('id', { length: 26 }).primaryKey(),

    // Foreign key to vault
    vaultId: varchar('vault_id', { length: 26 })
      .notNull()
      .references(() => TableVault.id, { onDelete: 'cascade' }),

    // Device identifier (client-generated ULID, unique per vault per device)
    deviceId: varchar('device_id', { length: 26 }).notNull(),

    // Device metadata for user-facing identification
    // Auto-detected by client, sent during login (read-only)
    clientDeviceDescription: varchar('client_device_description', { length: 100 }), // e.g., "macOS 14.1 (aarch64)"

    // User-editable device name (set by vault owner via UI)
    serverDeviceName: varchar('server_device_name', { length: 100 }), // e.g., "Ryan's MacBook Pro"

    // Hashed session token (Blake3 hash of 32-byte random token)
    // Server NEVER stores raw session token - only Blake3 hash
    // Client sends raw token, server hashes and compares
    hashedSessionToken: varchar('hashed_session_token', { length: 64 }).notNull(), // Blake3 hex = 64 chars

    // Session expiration (Unix milliseconds)
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),

    // Last activity timestamp for session management
    lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),

    // Tracking
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ([
    // Index for looking up active sessions by vault + device
    index('idx_vault_device').on(table.vaultId, table.deviceId),

    // Index for token lookup (used on every authenticated request)
    index('idx_session_token').on(table.hashedSessionToken),

    // Unique: one active session per vault + device combination
    unique().on(table.vaultId, table.deviceId),
  ]),
);

export type SelectDeviceSession = typeof TableDeviceSession.$inferSelect;
export type InsertDeviceSession = typeof TableDeviceSession.$inferInsert;
