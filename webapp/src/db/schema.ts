import {
  mysqlTable,
  int,
  bigint,
  boolean,
  varchar,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }),
  passwordHash: varchar("password_hash", { length: 255 }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const keys = mysqlTable("user_keys", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  keyNumber: int("key_number").notNull(),
  publicKey: varchar("public_key", { length: 66 }).notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channels = mysqlTable(
  "channels",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 }).notNull(),
    counterpartyId: varchar("counterparty_id", { length: 36 }).notNull(),
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
  id: varchar("id", { length: 36 }).primaryKey(),
  channelId: varchar("channel_id", { length: 36 }).notNull(),
  senderAddress: varchar("sender_address", { length: 255 }).notNull(),
  encryptedContent: text("encrypted_content").notNull(),
  senderPubKey: varchar("sender_pub_key", { length: 66 }).notNull(),
  recipientPubKey: varchar("recipient_pub_key", { length: 66 }).notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pendingDeliveries = mysqlTable("pending_deliveries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  senderAddress: varchar("sender_address", { length: 255 }).notNull(),
  recipientAddress: varchar("recipient_address", { length: 255 }).notNull(),
  encryptedContent: text("encrypted_content").notNull(),
  senderPubKey: varchar("sender_pub_key", { length: 66 }).notNull(),
  recipientPubKey: varchar("recipient_pub_key", { length: 66 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const powLog = mysqlTable("pow_log", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  algorithm: varchar("algorithm", { length: 32 }).notNull(),
  difficulty: bigint("difficulty", { mode: "bigint" }).notNull(),
  cumulativeDifficulty: bigint("cumulative_difficulty", {
    mode: "bigint",
  }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
