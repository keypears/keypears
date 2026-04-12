import {
  mysqlTable,
  int,
  bigint,
  boolean,
  varchar,
  datetime,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { UUID } from "uuidv7";

// --- Custom column types ---

/** binary(16) in MySQL, formatted UUIDv7 string in TypeScript */
const binaryId = customType<{ data: string }>({
  dataType() {
    return "binary(16)";
  },
  toDriver(data: string) {
    return Buffer.from(UUID.parse(data).bytes);
  },
  fromDriver(data) {
    return UUID.ofInner(new Uint8Array(data as Buffer)).toString();
  },
});

/** varbinary(N) in MySQL, hex string in TypeScript */
const binaryHex = (name: string, length: number) =>
  customType<{ data: string }>({
    dataType() {
      return `varbinary(${length})`;
    },
    toDriver(data: string) {
      return Buffer.from(data, "hex");
    },
    fromDriver(data) {
      return Buffer.from(data as Buffer).toString("hex");
    },
  })(name);

// --- Tables ---

export const domains = mysqlTable(
  "domains",
  {
    id: binaryId("id").primaryKey(),
    domain: varchar("domain", { length: 255 }).notNull().unique(),
    adminUserId: binaryId("admin_user_id"),
    openRegistration: boolean("open_registration").notNull().default(true),
    allowThirdPartyDomains: boolean("allow_third_party_domains")
      .notNull()
      .default(true),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [index("admin_user_id_idx").on(table.adminUserId)],
);

export const users = mysqlTable(
  "users",
  {
    id: binaryId("id").primaryKey(),
    domainId: binaryId("domain_id"),
    name: varchar("name", { length: 255 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    channelDifficulty: bigint("channel_difficulty", { mode: "bigint" }),
    messageDifficulty: bigint("message_difficulty", { mode: "bigint" }),
    tosAcceptedAt: datetime("tos_accepted_at"),
    expiresAt: datetime("expires_at"),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("name_domain_idx").on(table.name, table.domainId),
    index("domain_id_idx").on(table.domainId),
    index("users_expires_idx").on(table.expiresAt),
  ],
);

export const keys = mysqlTable(
  "user_keys",
  {
    id: binaryId("id").primaryKey(),
    userId: binaryId("user_id").notNull(),
    keyNumber: int("key_number").notNull(),
    publicKey: varchar("public_key", { length: 66 }).notNull(),
    encryptedPrivateKey: binaryHex("encrypted_private_key", 256).notNull(),
    loginKeyHash: varchar("login_key_hash", { length: 255 }),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [index("user_id_idx").on(table.userId)],
);

export const channels = mysqlTable(
  "channels",
  {
    id: binaryId("id").primaryKey(),
    ownerId: binaryId("owner_id").notNull(),
    counterpartyAddress: varchar("counterparty_address", {
      length: 255,
    }).notNull(),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
    updatedAt: datetime("updated_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("owner_counterparty_idx").on(
      table.ownerId,
      table.counterpartyAddress,
    ),
    index("channels_owner_updated_idx").on(table.ownerId, table.updatedAt),
  ],
);

export const secrets = mysqlTable(
  "secrets",
  {
    id: binaryId("id").primaryKey(),
    userId: binaryId("user_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    searchTerms: varchar("search_terms", { length: 255 }).notNull().default(""),
    sourceMessageId: binaryId("source_message_id"),
    sourceAddress: varchar("source_address", { length: 255 }),
    latestVersionId: binaryId("latest_version_id"),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
    updatedAt: datetime("updated_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [
    index("secret_user_updated_idx").on(
      table.userId,
      table.updatedAt,
      table.id,
    ),
    index("secret_source_message_idx").on(table.sourceMessageId),
  ],
);

export const secretVersions = mysqlTable(
  "secret_versions",
  {
    id: binaryId("id").primaryKey(),
    secretId: binaryId("secret_id").notNull(),
    version: int("version").notNull(),
    publicKey: varchar("public_key", { length: 66 }).notNull(),
    encryptedData: binaryHex("encrypted_data", 10000).notNull(),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [
    index("sv_secret_id_idx").on(table.secretId),
    uniqueIndex("sv_secret_version_idx").on(table.secretId, table.version),
  ],
);

export const messages = mysqlTable(
  "messages",
  {
    id: binaryId("id").primaryKey(),
    channelId: binaryId("channel_id").notNull(),
    senderAddress: varchar("sender_address", { length: 255 }).notNull(),
    encryptedContent: binaryHex("encrypted_content", 25000).notNull(),
    senderPubKey: varchar("sender_pub_key", { length: 66 }).notNull(),
    recipientPubKey: varchar("recipient_pub_key", { length: 66 }).notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [
    index("channel_id_idx").on(table.channelId, table.id),
    index("channel_read_idx").on(table.channelId, table.isRead),
  ],
);

export const pendingDeliveries = mysqlTable(
  "pending_deliveries",
  {
    id: binaryId("id").primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    senderAddress: varchar("sender_address", { length: 255 }).notNull(),
    recipientAddress: varchar("recipient_address", { length: 255 }).notNull(),
    encryptedContent: binaryHex("encrypted_content", 25000).notNull(),
    senderPubKey: varchar("sender_pub_key", { length: 66 }).notNull(),
    recipientPubKey: varchar("recipient_pub_key", { length: 66 }).notNull(),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [
    index("token_hash_idx").on(table.tokenHash),
    index("delivery_expires_idx").on(table.expiresAt),
  ],
);

export const sessions = mysqlTable(
  "sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: binaryId("user_id").notNull(),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [
    index("session_user_id_idx").on(table.userId),
    index("session_expires_idx").on(table.expiresAt),
  ],
);

export const usedPow = mysqlTable(
  "used_pow",
  {
    solvedHeaderHash: varchar("solved_header_hash", {
      length: 64,
    }).primaryKey(),
    solvedHeader: binaryHex("solved_header", 64).notNull(),
    target: varchar("target", { length: 64 }).notNull(),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [index("pow_expires_idx").on(table.expiresAt)],
);

export const powLog = mysqlTable(
  "pow_log",
  {
    id: binaryId("id").primaryKey(),
    userId: binaryId("user_id").notNull(),
    algorithm: varchar("algorithm", { length: 32 }).notNull(),
    difficulty: bigint("difficulty", { mode: "bigint" }).notNull(),
    cumulativeDifficulty: bigint("cumulative_difficulty", {
      mode: "bigint",
    }).notNull(),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [index("pow_user_id_idx").on(table.userId)],
);
