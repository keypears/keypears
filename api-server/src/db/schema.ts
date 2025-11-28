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

    // Vault public key hash (pubkeyhash) - 32-byte Blake3 hash of the vault's public key
    // This is the vault's public identity, similar to Bitcoin addresses
    // Used for vault lookup and future DH key exchange protocol
    // Primary public key is NEVER exposed - only relationship-specific derived keys
    vaultPubKeyHash: varchar('vault_pubkeyhash', { length: 64 }).notNull(), // Blake3 hex = 64 chars

    // Hashed login key - server stores hash of the login key for authentication
    // Client derives: password → password key → login key
    // Client sends: hash(login key) to server
    // Server stores: hash(hash(login key)) for verification
    // This is what the server checks to verify the user knows the password
    // Server CANNOT derive the password key or encryption key from this
    hashedLoginKey: varchar('hashed_login_key', { length: 64 }).notNull(), // Blake3 hex = 64 chars

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
