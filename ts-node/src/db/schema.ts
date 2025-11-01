import { pgTable, varchar, timestamp, text } from 'drizzle-orm/pg-core';

export const vault = pgTable('vault', {
  // Primary key - ULID for time-ordered, collision-resistant IDs
  id: varchar('id', { length: 26 }).primaryKey(),

  // Vault name (10-20 characters, unique across system)
  name: varchar('name', { length: 20 }).notNull().unique(),

  // Hashed login key - server hashes the login key the user sends
  // Client derives: password → password key → login key
  // Client sends: login key (for authentication)
  // Server stores: hash(login key) for verification
  // This is what the server checks to verify the user knows the password
  // Server CANNOT derive the password key or encryption key from this
  hashedLoginKey: varchar('hashed_login_key', { length: 64 }).notNull(),  // Blake3 hex = 64 chars

  // Encrypted vault master key
  // Client derives: password → password key → encryption key
  // Client encrypts: master vault key with encryption key
  // Server stores: encrypted master vault key (cannot decrypt it)
  // Client decrypts: after successful login, derives encryption key and decrypts
  encryptedMasterKey: text('encrypted_master_key').notNull(),  // Variable length for ACB3 output

  // Timestamps for auditing
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
