import { z } from "zod";

// Define the secret type enum
export const SecretType = z.enum(["password", "env_var", "api_key"]);

// Base metadata schema that can be extended
export const BaseMetadata = z.object({
  username: z.string().optional(),
  email: z.email().optional(),
  url: z.url().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  favorite: z.boolean().optional(),
});

// Type-specific metadata schemas
export const PasswordMetadata = BaseMetadata.extend({
  username: z.string().optional(),
  url: z.url().optional(),
  auto_submit: z.boolean().optional(),
});

export const ApiKeyMetadata = BaseMetadata.extend({
  service_name: z.string().optional(),
  key_name: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  expires_at: z.iso.datetime().optional(),
});

export const EnvVarMetadata = BaseMetadata.extend({
  environment: z.string().optional(), // e.g., "production", "staging", "development"
  project: z.string().optional(),
});

// Union type for all metadata
export const SecretMetadata = z.union([
  PasswordMetadata,
  ApiKeyMetadata,
  EnvVarMetadata,
  BaseMetadata,
]);

// Main secret container schema
export const SecretContainerSchema = z.object({
  id: z.ulid(), // Assumes you have a ULID validator
  name: z.string().min(1).max(255),
  domain: z.string().optional(),
  type: SecretType,
  secret: z.string(), // encrypted secret data
  metadata: SecretMetadata.optional(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  version: z.number().int().positive().default(1), // useful for conflict resolution
  deleted: z.boolean().default(false), // soft delete for sync purposes
});

// Inferred TypeScript types
// export type SecretType = z.infer<typeof SecretType>;
// export type SecretMetadata = z.infer<typeof SecretMetadata>;
export type SecretContainer = z.infer<typeof SecretContainerSchema>;

// Log entry schema for tracking changes
export const LogEntrySchema = z.object({
  id: z.ulid(),
  secret_id: z.string().ulid(),
  action: z.enum(["create", "update", "delete", "restore"]),
  timestamp: z.iso.datetime(),
  device_id: z.string().optional(), // track which device made the change
  checksum: z.string().optional(), // for integrity verification
  data: SecretContainerSchema, // the actual secret data at this point in time
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

// Collection schema for multiple secrets
export const SecretCollectionSchema = z.object({
  secrets: z.array(SecretContainerSchema),
  last_sync: z.iso.datetime().optional(),
  schema_version: z.string().default("1.0.0"), // for future migrations
});

export type SecretCollection = z.infer<typeof SecretCollectionSchema>;
