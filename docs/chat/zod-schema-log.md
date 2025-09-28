i'm creating an app called KeyPears which is a new type of password manager.
fundamentally, it does two things:

1. enable decentralized secret sharing, e.g. alice@example.com ->
   bob@example2.com, similar to email, except using diffie-hellman key exchange
   to share secrets securely.
2. enable self-hosted password management, e.g. alice@localhost. self-hosted
   password managers will need to be synced to a server to enable secret sharing
   and multi-device access.

now i plan to sync things by using a log of changes. when you add or update a
password, the log is updated.

inside this log will be the "password schema", or "shared secret container
schema" or something like that.

this fundamental data structure should have a few properties:

- name
- id (ulid)
- domain name (if applicable)
- type (password, env var, api key, etc)
- secret (the actual secret - encrypted)
- metadata (optional - e.g. username, notes, etc)
- created_at

i want to start by making a zod schema for this data structure. we can infer
typescript types from the zod schema. and we will have all the flexibility we
need to expand this data structure as we need to add more features in the
future.

can you give ma an example zod schema for this data structure?

# === ASSISTANT ===

Here's a Zod schema for your KeyPears password/secret container data structure:

```typescript
import { z } from 'zod';

// Define the secret type enum
export const SecretType = z.enum([
  'password',
  'env_var',
  'api_key',
  'ssh_key',
  'credit_card',
  'note',
  'totp',
  'recovery_codes',
  'other'
]);

// Base metadata schema that can be extended
export const BaseMetadata = z.object({
  username: z.string().optional(),
  email: z.string().email().optional(),
  url: z.string().url().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  favorite: z.boolean().optional(),
});

// Type-specific metadata schemas
export const PasswordMetadata = BaseMetadata.extend({
  username: z.string().optional(),
  url: z.string().url().optional(),
  auto_submit: z.boolean().optional(),
});

export const ApiKeyMetadata = BaseMetadata.extend({
  service_name: z.string().optional(),
  key_name: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  expires_at: z.string().datetime().optional(),
});

export const EnvVarMetadata = BaseMetadata.extend({
  environment: z.string().optional(), // e.g., "production", "staging", "development"
  project: z.string().optional(),
});

export const TotpMetadata = BaseMetadata.extend({
  issuer: z.string().optional(),
  account: z.string().optional(),
  algorithm: z.enum(['SHA1', 'SHA256', 'SHA512']).optional(),
  digits: z.number().int().min(6).max(8).optional(),
  period: z.number().int().positive().optional(),
});

// Union type for all metadata
export const SecretMetadata = z.union([
  PasswordMetadata,
  ApiKeyMetadata,
  EnvVarMetadata,
  TotpMetadata,
  BaseMetadata,
]);

// Main secret container schema
export const SecretContainerSchema = z.object({
  id: z.string().ulid(), // Assumes you have a ULID validator
  name: z.string().min(1).max(255),
  domain: z.string().optional(),
  type: SecretType,
  secret: z.string(), // encrypted secret data
  metadata: SecretMetadata.optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  version: z.number().int().positive().default(1), // useful for conflict resolution
  deleted: z.boolean().default(false), // soft delete for sync purposes
});

// Inferred TypeScript types
export type SecretType = z.infer<typeof SecretType>;
export type SecretMetadata = z.infer<typeof SecretMetadata>;
export type SecretContainer = z.infer<typeof SecretContainerSchema>;

// Log entry schema for tracking changes
export const LogEntrySchema = z.object({
  id: z.string().ulid(),
  secret_id: z.string().ulid(),
  action: z.enum(['create', 'update', 'delete', 'restore']),
  timestamp: z.string().datetime(),
  device_id: z.string().optional(), // track which device made the change
  checksum: z.string().optional(), // for integrity verification
  data: SecretContainerSchema, // the actual secret data at this point in time
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

// Collection schema for multiple secrets
export const SecretCollectionSchema = z.object({
  secrets: z.array(SecretContainerSchema),
  last_sync: z.string().datetime().optional(),
  schema_version: z.string().default('1.0.0'), // for future migrations
});

export type SecretCollection = z.infer<typeof SecretCollectionSchema>;
```

You'll also need to add the ULID validator to Zod. You can do this by extending
Zod:

```typescript
import { ulid, isValid } from 'ulidx'; // or your preferred ULID library

// Extend Zod with ULID validation
declare module 'zod' {
  interface ZodString {
    ulid(): ZodString;
  }
}

z.ZodString.prototype.ulid = function() {
  return this.refine((val) => isValid(val), {
    message: 'Invalid ULID format',
  });
};
```

Key features of this schema:

1. **Extensible metadata**: Different secret types can have type-specific
   metadata
2. **Versioning**: Built-in version field for conflict resolution during sync
3. **Soft deletes**: `deleted` flag for proper sync handling
4. **Log structure**: Separate schema for tracking changes over time
5. **Flexible secret types**: Enum that can be easily extended
6. **Validation**: Strong typing with runtime validation
7. **Future-proofing**: Schema version field for migrations

This gives you a solid foundation that can grow with your app's needs while
maintaining type safety and validation.

# === USER ===
