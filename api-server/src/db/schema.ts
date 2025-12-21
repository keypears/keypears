import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import type { VaultSettings } from "../zod-schemas.js";

export const TableVault = pgTable(
  "vault",
  {
    // Primary key - UUIDv7 in Crockford Base32 (26-char, time-ordered, collision-resistant)
    id: varchar("id", { length: 26 }).primaryKey(),

    // Vault name (1-30 characters, alphanumeric, starts with letter)
    name: varchar("name", { length: 30 }).notNull(),

    // Domain (e.g., "keypears.com", "passapples.com")
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

    // Vault settings - JSON blob for user-configurable settings
    // Type inferred from VaultSettings Zod schema
    settings: jsonb("settings").$type<VaultSettings>().default({}).notNull(),
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

// Engagement keys table - stores server-generated public keys for DH key exchange
// Server can generate public keys for users while only the user can derive private keys
// Uses elliptic curve addition: engagementPubKey = vaultPubKey + derivationPubKey
export const TableEngagementKey = pgTable(
  "engagement_key",
  {
    // Primary key - UUIDv7 in Crockford Base32 (26-char, time-ordered, collision-resistant)
    id: varchar("id", { length: 26 }).primaryKey(),

    // Foreign key to vault
    vaultId: varchar("vault_id", { length: 26 })
      .notNull()
      .references(() => TableVault.id, { onDelete: "cascade" }),

    // DB entropy - 32 bytes random, unique per engagement key
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

    // Final engagement public key - the result of elliptic curve addition
    // engagementPubKey = vaultPubKey + derivationPubKey
    engagementPubKey: varchar("engagement_pubkey", { length: 66 }).notNull(), // 33 bytes hex = 66 chars

    // Hash of engagement public key for efficient unique constraint
    engagementPubKeyHash: varchar("engagement_pubkey_hash", {
      length: 64,
    }).notNull(), // SHA256 hex = 64 chars

    // Counterparty address - for DH key exchange (e.g., "bob@keypears.com")
    // Null for general-purpose engagement keys
    counterpartyAddress: varchar("counterparty_address", { length: 255 }),

    // Purpose of this engagement key:
    // - "manual": User-created via Engagement Keys page (general purpose)
    // - "send": Auto-created when initiating messaging to someone
    // - "receive": Auto-created when someone requests a key to message you
    purpose: varchar("purpose", {
      length: 30,
      enum: ["send", "receive", "manual"],
    }).notNull(),

    // Counterparty's public key - for validation in messaging
    // Only set for "receive" keys (stores sender's pubkey for validation)
    counterpartyPubKey: varchar("counterparty_pubkey", { length: 66 }),

    // Vault generation - tracks key rotation (default 1 for initial vault)
    vaultGeneration: integer("vault_generation").notNull().default(1),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Unique constraint on engagement public key hash (prevents duplicate keys)
    unique().on(table.engagementPubKeyHash),

    // Index for listing keys by vault in reverse chronological order
    index("idx_engagement_key_vault_created").on(
      table.vaultId,
      table.createdAt,
    ),
  ],
);

export type SelectEngagementKey = typeof TableEngagementKey.$inferSelect;
export type InsertEngagementKey = typeof TableEngagementKey.$inferInsert;

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

    // Difficulty (bigint stored as number - safe up to 2^53)
    difficulty: bigint("difficulty", { mode: "number" }).notNull(),

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

// Channel view table - each user's view of a conversation with another user
// This is a per-participant view, not a shared channel record
export const TableChannelView = pgTable(
  "channel_view",
  {
    // Primary key - UUIDv7 in Crockford Base32 (26-char)
    id: varchar("id", { length: 26 }).primaryKey(),

    // Owner of this channel view (e.g., "alice@example.com")
    ownerAddress: varchar("owner_address", { length: 255 }).notNull(),

    // Who they're talking to (e.g., "bob@example2.com")
    counterpartyAddress: varchar("counterparty_address", {
      length: 255,
    }).notNull(),

    // Per-channel PoW difficulty override (null = use global setting)
    minDifficulty: bigint("min_difficulty", { mode: "number" }),

    // Secret ID for vault storage - used when messages are saved to vault
    // Server generates this on channel creation to ensure consistency across devices
    // All of a user's devices will see the same secretId for the same channel
    secretId: varchar("secret_id", { length: 26 }).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Each address pair should have only one channel view per owner
    unique().on(table.ownerAddress, table.counterpartyAddress),

    // Index for listing channels by owner
    index("idx_channel_view_owner").on(table.ownerAddress, table.updatedAt),

    // Index for looking up by counterparty
    index("idx_channel_view_counterparty").on(table.counterpartyAddress),
  ],
);

export type SelectChannelView = typeof TableChannelView.$inferSelect;
export type InsertChannelView = typeof TableChannelView.$inferInsert;

// Inbox message table - stores received messages for each channel
// No outbox table - sent messages are stored directly in the sender's vault
export const TableInboxMessage = pgTable(
  "inbox_message",
  {
    // Primary key - UUIDv7 in Crockford Base32 (26-char)
    id: varchar("id", { length: 26 }).primaryKey(),

    // Foreign key to channel view
    channelViewId: varchar("channel_view_id", { length: 26 })
      .notNull()
      .references(() => TableChannelView.id, { onDelete: "cascade" }),

    // Sender's address (e.g., "bob@example.com")
    senderAddress: varchar("sender_address", { length: 255 }).notNull(),

    // Message order within channel (1, 2, 3, ...)
    orderInChannel: integer("order_in_channel").notNull(),

    // Encrypted message content (ACS2 with ECDH shared secret)
    encryptedContent: text("encrypted_content").notNull(),

    // Sender's engagement public key (for ECDH decryption)
    senderEngagementPubKey: varchar("sender_engagement_pubkey", {
      length: 66,
    }).notNull(),

    // Recipient's engagement public key (for looking up private key)
    recipientEngagementPubKey: varchar("recipient_engagement_pubkey", {
      length: 66,
    }).notNull(),

    // PoW challenge that was solved to send this message
    powChallengeId: varchar("pow_challenge_id", { length: 26 })
      .notNull()
      .references(() => TablePowChallenge.id),

    // Read status
    isRead: boolean("is_read").notNull().default(false),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),

    // Expiration (30 days from creation, null if channel is saved)
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    // Index for listing messages in a channel
    index("idx_inbox_message_channel").on(
      table.channelViewId,
      table.orderInChannel,
    ),

    // Index for finding unread messages
    index("idx_inbox_message_unread").on(table.channelViewId, table.isRead),

    // Unique constraint on channel + order
    unique().on(table.channelViewId, table.orderInChannel),
  ],
);

export type SelectInboxMessage = typeof TableInboxMessage.$inferSelect;
export type InsertInboxMessage = typeof TableInboxMessage.$inferInsert;
