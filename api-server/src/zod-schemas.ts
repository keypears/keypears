import { z } from "zod";
import { vaultNameSchema } from "@keypears/lib";

export const Blake3RequestSchema = z.object({
  data: z.string(),
});

export const Blake3ResponseSchema = z.object({
  hash: z.string().length(64),
});

// Check name availability
export const CheckNameAvailabilityRequestSchema = z.object({
  name: vaultNameSchema,
  domain: z.string().min(1).max(255),
});

export const CheckNameAvailabilityResponseSchema = z.object({
  available: z.boolean(),
});

// Register vault
export const RegisterVaultRequestSchema = z.object({
  vaultId: z.string().length(26), // ULID generated client-side
  name: vaultNameSchema,
  domain: z.string().min(1).max(255),
  vaultPubKeyHash: z.string().length(64), // Blake3 hash hex = 64 chars
  loginKey: z.string().length(64), // Unhashed login key (hex)
  encryptedVaultKey: z.string(), // Encrypted vault key (hex, variable length due to ACB3)
});

export const RegisterVaultResponseSchema = z.object({
  vaultId: z.string(),
});

// Create secret update
export const CreateSecretUpdateRequestSchema = z.object({
  vaultId: z.string().length(26), // ULID
  secretId: z.string().length(26), // ULID (same for all updates to this secret)
  encryptedBlob: z.string().min(1), // Encrypted JSON containing all secret data
});

export const CreateSecretUpdateResponseSchema = z.object({
  id: z.string().length(26), // ULID of the new update
  globalOrder: z.number().int().positive(),
  localOrder: z.number().int().positive(),
  createdAt: z.date(),
});

// Get secret updates (for polling)
export const GetSecretUpdatesRequestSchema = z.object({
  vaultId: z.string().length(26), // ULID
  sinceGlobalOrder: z.number().int().nonnegative().default(0), // Get updates after this order
  limit: z.number().int().positive().max(1000).default(100), // Batch size
});

export const GetSecretUpdatesResponseSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().length(26),
      secretId: z.string().length(26),
      globalOrder: z.number().int().positive(),
      localOrder: z.number().int().positive(),
      encryptedBlob: z.string(),
      createdAt: z.date(),
    }),
  ),
  hasMore: z.boolean(), // True if more updates exist beyond the limit
  latestGlobalOrder: z.number().int().nonnegative(), // Highest order in the vault
});
