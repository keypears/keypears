import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";

export const keypears = mysqlTable("keypears", {
  id: int("id").primaryKey().autoincrement(),
  passwordHash: varchar("password_hash", { length: 255 }),
  publicKey: varchar("public_key", { length: 66 }),
  encryptedPrivateKey: text("encrypted_private_key"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
