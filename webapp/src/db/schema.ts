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
import { WebBuf } from "@webbuf/webbuf";

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

/** blob in MySQL (up to 64KB), WebBuf in TypeScript */
const blob = (name: string) =>
  customType<{ data: WebBuf }>({
    dataType() {
      return "blob";
    },
    fromDriver(data) {
      return WebBuf.from(data as Buffer);
    },
    toDriver(data) {
      return Buffer.from(data);
    },
  })(name);

/** mediumblob in MySQL (up to 16MB), WebBuf in TypeScript */
const mediumBlob = (name: string) =>
  customType<{ data: WebBuf }>({
    dataType() {
      return "mediumblob";
    },
    fromDriver(data) {
      return WebBuf.from(data as Buffer);
    },
    toDriver(data) {
      return Buffer.from(data);
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
    index("users_domain_name_idx").on(table.domainId, table.name),
    index("users_unsaved_expiry_idx").on(
      table.passwordHash,
      table.expiresAt,
      table.createdAt,
    ),
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
    ed25519PublicKey: blob("ed25519_public_key").notNull(),
    encryptedEd25519Key: blob("encrypted_ed25519_key").notNull(),
    signingPublicKey: blob("signing_public_key").notNull(),
    encryptedSigningKey: blob("encrypted_signing_key").notNull(),
    x25519PublicKey: blob("x25519_public_key").notNull(),
    encryptedX25519Key: blob("encrypted_x25519_key").notNull(),
    encapPublicKey: blob("encap_public_key").notNull(),
    encryptedDecapKey: blob("encrypted_decap_key").notNull(),
    loginKeyHash: varchar("login_key_hash", { length: 255 }),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [
    index("user_id_idx").on(table.userId),
    uniqueIndex("user_key_number_idx").on(table.userId, table.keyNumber),
    index("user_key_created_idx").on(table.userId, table.createdAt),
  ],
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
    index("secret_source_message_user_idx").on(
      table.sourceMessageId,
      table.userId,
    ),
  ],
);

export const secretVersions = mysqlTable(
  "secret_versions",
  {
    id: binaryId("id").primaryKey(),
    secretId: binaryId("secret_id").notNull(),
    version: int("version").notNull(),
    keyId: binaryId("key_id").notNull(),
    encryptedData: mediumBlob("encrypted_data").notNull(),
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
    encryptedContent: mediumBlob("encrypted_content").notNull(),
    senderEncryptedContent: mediumBlob("sender_encrypted_content").notNull(),
    senderEd25519PubKey: blob("sender_ed25519_pub_key").notNull(),
    senderX25519PubKey: blob("sender_x25519_pub_key").notNull(),
    senderMldsaPubKey: blob("sender_mldsa_pub_key").notNull(),
    recipientX25519PubKey: blob("recipient_x25519_pub_key").notNull(),
    recipientMlkemPubKey: blob("recipient_mlkem_pub_key").notNull(),
    senderSignature: blob("sender_signature").notNull(),
    messageFingerprint: varchar("message_fingerprint", {
      length: 64,
    }).notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [
    index("channel_id_idx").on(table.channelId, table.id),
    index("channel_read_idx").on(table.channelId, table.isRead),
    uniqueIndex("message_channel_fingerprint_idx").on(
      table.channelId,
      table.messageFingerprint,
    ),
  ],
);

export const pendingDeliveries = mysqlTable(
  "pending_deliveries",
  {
    id: binaryId("id").primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    senderAddress: varchar("sender_address", { length: 255 }).notNull(),
    recipientAddress: varchar("recipient_address", { length: 255 }).notNull(),
    encryptedContent: mediumBlob("encrypted_content").notNull(),
    senderEncryptedContent: mediumBlob("sender_encrypted_content").notNull(),
    senderEd25519PubKey: blob("sender_ed25519_pub_key").notNull(),
    senderX25519PubKey: blob("sender_x25519_pub_key").notNull(),
    senderMldsaPubKey: blob("sender_mldsa_pub_key").notNull(),
    recipientX25519PubKey: blob("recipient_x25519_pub_key").notNull(),
    recipientMlkemPubKey: blob("recipient_mlkem_pub_key").notNull(),
    senderSignature: blob("sender_signature").notNull(),
    recipientKeyNumber: int("recipient_key_number").notNull(),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: datetime("created_at")
      .default(sql`NOW()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("token_hash_idx").on(table.tokenHash),
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
    solvedHeader: blob("solved_header").notNull(),
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
  (table) => [
    index("pow_user_id_idx").on(table.userId),
    index("pow_user_id_id_idx").on(table.userId, table.id),
  ],
);
