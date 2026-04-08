import {
  mysqlTable,
  int,
  bigint,
  boolean,
  varchar,
  text,
  timestamp,
  uniqueIndex,
  customType,
} from "drizzle-orm/mysql-core";
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

// --- Tables ---

export const domains = mysqlTable("domains", {
  id: binaryId("id").primaryKey(),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  adminUserId: binaryId("admin_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = mysqlTable(
  "users",
  {
    id: binaryId("id").primaryKey(),
    domainId: binaryId("domain_id"),
    name: varchar("name", { length: 255 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("name_domain_idx").on(table.name, table.domainId),
  ],
);

export const keys = mysqlTable("user_keys", {
  id: binaryId("id").primaryKey(),
  userId: binaryId("user_id").notNull(),
  keyNumber: int("key_number").notNull(),
  publicKey: varchar("public_key", { length: 66 }).notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  loginKeyHash: varchar("login_key_hash", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channels = mysqlTable(
  "channels",
  {
    id: binaryId("id").primaryKey(),
    ownerId: binaryId("owner_id").notNull(),
    counterpartyAddress: varchar("counterparty_address", {
      length: 255,
    }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("owner_counterparty_idx").on(
      table.ownerId,
      table.counterpartyAddress,
    ),
  ],
);

export const messages = mysqlTable("messages", {
  id: binaryId("id").primaryKey(),
  channelId: binaryId("channel_id").notNull(),
  senderAddress: varchar("sender_address", { length: 255 }).notNull(),
  encryptedContent: text("encrypted_content").notNull(),
  senderPubKey: varchar("sender_pub_key", { length: 66 }).notNull(),
  recipientPubKey: varchar("recipient_pub_key", { length: 66 }).notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pendingDeliveries = mysqlTable("pending_deliveries", {
  id: binaryId("id").primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  senderAddress: varchar("sender_address", { length: 255 }).notNull(),
  recipientAddress: varchar("recipient_address", { length: 255 }).notNull(),
  encryptedContent: text("encrypted_content").notNull(),
  senderPubKey: varchar("sender_pub_key", { length: 66 }).notNull(),
  recipientPubKey: varchar("recipient_pub_key", { length: 66 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = mysqlTable("sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: binaryId("user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usedPow = mysqlTable("used_pow", {
  solvedHeaderHash: varchar("solved_header_hash", { length: 64 }).primaryKey(),
  solvedHeader: text("solved_header").notNull(),
  target: varchar("target", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const powLog = mysqlTable("pow_log", {
  id: binaryId("id").primaryKey(),
  userId: binaryId("user_id").notNull(),
  algorithm: varchar("algorithm", { length: 32 }).notNull(),
  difficulty: bigint("difficulty", { mode: "bigint" }).notNull(),
  cumulativeDifficulty: bigint("cumulative_difficulty", {
    mode: "bigint",
  }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
