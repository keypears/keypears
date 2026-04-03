import {
  mysqlTable,
  int,
  bigint,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  passwordHash: varchar("password_hash", { length: 255 }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const keys = mysqlTable("user_keys", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  keyNumber: int("key_number").notNull(),
  publicKey: varchar("public_key", { length: 66 }).notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const powLog = mysqlTable("pow_log", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  algorithm: varchar("algorithm", { length: 32 }).notNull(),
  difficulty: bigint("difficulty", { mode: "bigint" }).notNull(),
  cumulativeDifficulty: bigint("cumulative_difficulty", {
    mode: "bigint",
  }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
