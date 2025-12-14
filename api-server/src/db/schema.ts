import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const TableVault = pgTable(
  "vault",
  {
    // Primary key - UUIDv7 in Crockford Base32 (26-char, time-ordered, collision-resistant)
    id: varchar("id", { length: 26 }).primaryKey(),

    // Vault name (1-30 characters, alphanumeric, starts with letter)
    name: varchar("name", { length: 30 }).notNull(),

    // Domain (e.g., "keypears.com", "hevybags.com", "wokerium.com")
    domain: varchar("domain", { length: 255 }).notNull(),

    // Vault public key hash (pubkeyhash) - 32-byte Blake3 hash of the vault's public key
    // This is the vault's public identity, similar to Bitcoin addresses
    // Used for vault lookup and future DH key exchange protocol
    // Primary public key is NEVER exposed - only relationship-specific derived keys
    vaultPubKeyHash: varchar("vault_pubkeyhash", { length: 64 }).notNull(), // Blake3 hex = 64 chars

    // Vault public key - 33-byte compressed secp256k1 public key
    // Used for server-side derived key generation (key derivation system)
    // Server can generate derived public keys without knowing the private key
    // Using elliptic curve addition: derivedPubKey = vaultPubKey + derivationPubKey
    vaultPubKey: varchar("vault_pubkey", { length: 66 }), // 33 bytes hex = 66 chars (nullable for migration)

    // Hashed login key - server stores KDF of the login key for authentication
    // Client derives: password → password key (100k rounds) → login key (100k rounds)
    // Client sends: login key (unhashed) to server via HTTPS
    // Server derives: hashed login key (100k rounds KDF)
    // Server stores: hashed login key for verification
    // This is what the server checks to verify the user knows the password
    // Server CANNOT derive the password key or encryption key from this
    hashedLoginKey: varchar("hashed_login_key", { length: 64 }).notNull(), // Blake3 hex = 64 chars

    // Encrypted vault key - stored on server for cross-device import
    // Encrypted with encryption key derived from password
    // Allows importing vault on new device by entering password
    encryptedVaultKey: text("encrypted_vault_key").notNull(),

    // Last sync timestamp (Unix milliseconds)
    lastSyncTimestamp: bigint("last_sync_timestamp", { mode: "number" }),

    // Timestamps for auditing
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Unique constraint on name + domain combination (like email addresses)
    unique().on(table.name, table.domain),
  ],
);

export type SelectVault = typeof TableVault.$inferSelect;
export type InsertVault = typeof TableVault.$inferInsert;

// Secret updates table - append-only immutable log of all secret changes
export const TableSecretUpdate = pgTable(
  "secret_update",
  {
    // Primary key - UUIDv7 in Crockford Base32 (26-char, time-ordered, collision-resistant)
    id: varchar("id", { length: 26 }).primaryKey(),

    // Foreign keys
    vaultId: varchar("vault_id", { length: 26 })
      .notNull()
      .references(() => TableVault.id, { onDelete: "cascade" }),

    // Secret identifier - groups all updates for the same secret
    secretId: varchar("secret_id", { length: 26 }).notNull(),

    // Order numbers for efficient sync polling
    // globalOrder: vault-wide sequential order (1, 2, 3, ...)
    // localOrder: per-secret sequential order (1, 2, 3, ...)
    globalOrder: bigint("global_order", { mode: "number" }).notNull(),
    localOrder: integer("local_order").notNull(),

    // Encrypted blob - contains all secret metadata + encrypted password
    // Client encrypts entire secret update (name, username, encryptedPassword, etc.)
    // Server only sees: ID, vault_id, secret_id, order numbers, this blob
    encryptedBlob: text("encrypted_blob").notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Index for efficient polling: "give me all updates since order N"
    index("idx_vault_global_order").on(table.vaultId, table.globalOrder),

    // Index for viewing secret history: "give me all updates for this secret"
    index("idx_secret_local_order").on(table.secretId, table.localOrder),

    // Ensure global order is unique per vault
    unique().on(table.vaultId, table.globalOrder),
  ],
);

export type SelectSecretUpdate = typeof TableSecretUpdate.$inferSelect;
export type InsertSecretUpdate = typeof TableSecretUpdate.$inferInsert;

// Device sessions table - tracks active sessions for devices accessing vaults
export const TableDeviceSession = pgTable(
  "device_session",
  {
    // Primary key - UUIDv7 in Crockford Base32 (26-char)
    id: varchar("id", { length: 26 }).primaryKey(),

    // Foreign key to vault
    vaultId: varchar("vault_id", { length: 26 })
      .notNull()
      .references(() => TableVault.id, { onDelete: "cascade" }),

    // Device identifier (client-generated UUIDv7, unique per vault per device)
    deviceId: varchar("device_id", { length: 26 }).notNull(),

    // Device metadata for user-facing identification
    // Auto-detected by client, sent during login (read-only)
    clientDeviceDescription: varchar("client_device_description", {
      length: 100,
    }), // e.g., "macOS 14.1 (aarch64)"

    // User-editable device name (set by vault owner via UI)
    serverDeviceName: varchar("server_device_name", { length: 100 }), // e.g., "Ryan's MacBook Pro"

    // Hashed session token (Blake3 hash of 32-byte random token)
    // Server NEVER stores raw session token - only Blake3 hash
    // Client sends raw token, server hashes and compares
    hashedSessionToken: varchar("hashed_session_token", {
      length: 64,
    }).notNull(), // Blake3 hex = 64 chars

    // Session expiration (Unix milliseconds)
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),

    // Last activity timestamp for session management
    lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),

    // Tracking
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Index for looking up active sessions by vault + device
    index("idx_vault_device").on(table.vaultId, table.deviceId),

    // Index for token lookup (used on every authenticated request)
    index("idx_session_token").on(table.hashedSessionToken),

    // Unique: one active session per vault + device combination
    unique().on(table.vaultId, table.deviceId),
  ],
);

export type SelectDeviceSession = typeof TableDeviceSession.$inferSelect;
export type InsertDeviceSession = typeof TableDeviceSession.$inferInsert;

// Derived keys table - stores server-generated derived public keys
// Server can generate public keys for users while only the user can derive private keys
// Uses elliptic curve addition: derivedPubKey = vaultPubKey + derivationPubKey
export const TableDerivedKey = pgTable(
  "derived_key",
  {
    // Primary key - UUIDv7 in Crockford Base32 (26-char, time-ordered, collision-resistant)
    id: varchar("id", { length: 26 }).primaryKey(),

    // Foreign key to vault
    vaultId: varchar("vault_id", { length: 26 })
      .notNull()
      .references(() => TableVault.id, { onDelete: "cascade" }),

    // DB entropy - 32 bytes random, unique per derived key
    // Combined with server entropy to derive the derivation private key
    dbEntropy: varchar("db_entropy", { length: 64 }).notNull(), // 32 bytes hex = 64 chars

    // Hash of DB entropy for efficient lookup without exposing raw entropy
    dbEntropyHash: varchar("db_entropy_hash", { length: 64 }).notNull(), // SHA256 hex = 64 chars

    // Server entropy index - which DERIVATION_ENTROPY_N was used
    // Enables server entropy rotation while maintaining ability to re-derive historical keys
    serverEntropyIndex: integer("server_entropy_index").notNull(),

    // Derivation public key - the addend used in elliptic curve addition
    // derivationPubKey = derivationPrivKey * G
    derivationPubKey: varchar("derivation_pubkey", { length: 66 }).notNull(), // 33 bytes hex = 66 chars

    // Final derived public key - the result of elliptic curve addition
    // derivedPubKey = vaultPubKey + derivationPubKey
    derivedPubKey: varchar("derived_pubkey", { length: 66 }).notNull(), // 33 bytes hex = 66 chars

    // Hash of derived public key for efficient unique constraint
    derivedPubKeyHash: varchar("derived_pubkey_hash", { length: 64 }).notNull(), // SHA256 hex = 64 chars

    // Counterparty address - for future DH key exchange (e.g., "bob@keypears.com")
    // Null for general-purpose derived keys
    counterpartyAddress: varchar("counterparty_address", { length: 255 }),

    // Vault generation - tracks key rotation (default 1 for initial vault)
    vaultGeneration: integer("vault_generation").notNull().default(1),

    // Whether this key has been used (e.g., in a transaction or DH exchange)
    isUsed: boolean("is_used").notNull().default(false),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Unique constraint on derived public key hash (prevents duplicate keys)
    unique().on(table.derivedPubKeyHash),

    // Index for listing keys by vault in reverse chronological order
    index("idx_derived_key_vault_created").on(table.vaultId, table.createdAt),

    // Index for filtering unused keys by vault
    index("idx_derived_key_vault_unused").on(
      table.vaultId,
      table.isUsed,
      table.createdAt,
    ),
  ],
);

export type SelectDerivedKey = typeof TableDerivedKey.$inferSelect;
export type InsertDerivedKey = typeof TableDerivedKey.$inferInsert;

// PoW challenges table - stores proof-of-work challenges to prevent replay attacks
// Each challenge can only be used once and expires after a set time
export const TablePowChallenge = pgTable(
  "pow_challenge",
  {
    // Primary key - UUIDv7 in Crockford Base32 (26-char, time-ordered, collision-resistant)
    id: varchar("id", { length: 26 }).primaryKey(),

    // Algorithm used for this challenge (currently only "pow5-64b")
    algorithm: varchar("algorithm", { length: 20 }).notNull(),

    // Challenge header (hex-encoded)
    // pow5-64b: 64 bytes = 128 hex chars
    header: text("header").notNull(),

    // Target hash that the solution must be less than (32 bytes hex = 64 chars)
    target: varchar("target", { length: 64 }).notNull(),

    // Difficulty as string (bigint representation)
    difficulty: varchar("difficulty", { length: 30 }).notNull(),

    // Whether this challenge has been used (verified)
    // Once used, cannot be reused - prevents replay attacks
    isUsed: boolean("is_used").notNull().default(false),

    // Solution data (populated when challenge is verified)
    // Solved header with the winning nonce (hex-encoded)
    solvedHeader: text("solved_header"),

    // Hash of the solved header (32 bytes hex = 64 chars)
    solvedHash: varchar("solved_hash", { length: 64 }),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),

    // Expiration time - challenges expire after a set time (e.g., 5 minutes)
    expiresAt: timestamp("expires_at").notNull(),

    // When the challenge was verified (null if not yet verified)
    verifiedAt: timestamp("verified_at"),
  },
  (table) => [
    // Index for looking up unused challenges (cleanup job)
    index("idx_pow_challenge_expires").on(table.expiresAt),
  ],
);

export type SelectPowChallenge = typeof TablePowChallenge.$inferSelect;
export type InsertPowChallenge = typeof TablePowChallenge.$inferInsert;
