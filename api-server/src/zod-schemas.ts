import { z } from "zod";
import { vaultNameSchema } from "@keypears/lib";

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
  vaultPubKey: z.string().length(66), // Compressed secp256k1 public key hex = 66 chars (33 bytes)
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

// Create derived key
export const CreateDerivedKeyRequestSchema = z.object({
  vaultId: z.string().length(26), // ULID
});

export const CreateDerivedKeyResponseSchema = z.object({
  id: z.string().length(26), // ULID of the derived key record
  derivedPubKey: z.string().length(66), // 33 bytes hex = 66 chars
  createdAt: z.date(),
});

// Get derived keys (paginated)
export const GetDerivedKeysRequestSchema = z.object({
  vaultId: z.string().length(26), // ULID
  limit: z.number().int().positive().max(100).default(20),
  beforeCreatedAt: z.date().optional(), // Cursor for pagination
});

export const GetDerivedKeysResponseSchema = z.object({
  keys: z.array(
    z.object({
      id: z.string().length(26),
      derivedPubKey: z.string().length(66),
      createdAt: z.date(),
      isUsed: z.boolean(),
    }),
  ),
  hasMore: z.boolean(),
});

// Get derivation private key (for client to derive full private key)
export const GetDerivationPrivKeyRequestSchema = z.object({
  derivedKeyId: z.string().length(26), // ULID of the derived key record
});

export const GetDerivationPrivKeyResponseSchema = z.object({
  derivationPrivKey: z.string().length(64), // 32 bytes hex = 64 chars
});
