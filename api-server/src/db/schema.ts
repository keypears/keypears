import { count, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  char,
  customType,
  date,
  decimal,
  doublePrecision,
  index,
  integer,
  interval,
  json,
  jsonb,
  numeric,
  pgSchema,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { ulid } from "ulid";

export const TableVault = pgTable(
  'vault',
  {
    // Primary key - ULID for time-ordered, collision-resistant IDs
    id: varchar('id', { length: 26 }).primaryKey(),

    // Vault name (1-30 characters, alphanumeric, starts with letter)
    name: varchar('name', { length: 30 }).notNull(),

    // Domain (e.g., "keypears.com", "hevybags.com", "wokerium.com")
    domain: varchar('domain', { length: 255 }).notNull(),

    // Hashed login key - server hashes the login key the user sends
    // Client derives: password → password key → login key
    // Client sends: login key (for authentication)
    // Server stores: hash(login key) for verification
    // This is what the server checks to verify the user knows the password
    // Server CANNOT derive the password key or encryption key from this
    hashedLoginKey: varchar('hashed_login_key', { length: 64 }).notNull(), // Blake3 hex = 64 chars

    // Encrypted password key - used to unlock vault on client
    // Client derives: password → password key → encryption key
    // Client encrypts: password key with encryption key
    // Server stores: encrypted password key (cannot decrypt it)
    // Client decrypts: after successful login, derives encryption key and decrypts password key
    encryptedPasswordKey: text('encrypted_password_key').notNull(), // Variable length for ACB3 output

    // Last sync timestamp (Unix milliseconds)
    lastSyncTimestamp: bigint('last_sync_timestamp', { mode: 'number' }),

    // Timestamps for auditing
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint on name + domain combination (like email addresses)
    uniqueNameDomain: unique().on(table.name, table.domain),
  }),
);

export type SelectVault = typeof TableVault.$inferSelect;
export type InsertVault = typeof TableVault.$inferInsert;
