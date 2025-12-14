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
  vaultId: z.string().length(26), // UUIDv7 (26-char Crockford Base32) generated client-side
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
  vaultId: z.string().length(26), // UUIDv7 (26-char)
  secretId: z.string().length(26), // UUIDv7 (26-char, same for all updates to this secret)
  encryptedBlob: z.string().min(1), // Encrypted JSON containing all secret data
});

export const CreateSecretUpdateResponseSchema = z.object({
  id: z.string().length(26), // UUIDv7 (26-char) of the new update
  globalOrder: z.number().int().positive(),
  localOrder: z.number().int().positive(),
  createdAt: z.date(),
});

// Get secret updates (for polling)
export const GetSecretUpdatesRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
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
  vaultId: z.string().length(26), // UUIDv7 (26-char)
});

export const CreateDerivedKeyResponseSchema = z.object({
  id: z.string().length(26), // UUIDv7 (26-char) of the derived key record
  derivedPubKey: z.string().length(66), // 33 bytes hex = 66 chars
  createdAt: z.date(),
});

// Get derived keys (paginated)
export const GetDerivedKeysRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
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
  derivedKeyId: z.string().length(26), // UUIDv7 (26-char) of the derived key record
});

export const GetDerivationPrivKeyResponseSchema = z.object({
  derivationPrivKey: z.string().length(64), // 32 bytes hex = 64 chars
});

// PoW Algorithm enum
export const PowAlgorithmSchema = z.enum(["pow5-64b", "pow5-217a"]);
export type PowAlgorithm = z.infer<typeof PowAlgorithmSchema>;

// PoW Challenge - generates a challenge and stores it in the database
// Each challenge can only be used once and expires after 5 minutes
// Minimum difficulty: 256 (2^8)
// Default difficulty: 4,194,304 (2^22)
export const GetPowChallengeRequestSchema = z.object({
  difficulty: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined) return true;
        const num = BigInt(val);
        return num >= 256n;
      },
      { message: "Difficulty must be at least 256" },
    ),
});

export const GetPowChallengeResponseSchema = z.object({
  id: z.string().length(26), // UUIDv7 (26-char) challenge ID for verification
  header: z.string(), // 64 bytes (128 chars) for pow5-64b, 217 bytes (434 chars) for pow5-217a
  target: z.string().length(64), // 32 bytes hex = 64 chars
  difficulty: z.string(), // bigint as string
  algorithm: PowAlgorithmSchema,
});

// PoW Proof verification - looks up challenge from database and marks as used
export const VerifyPowProofRequestSchema = z.object({
  challengeId: z.string().length(26), // UUIDv7 (26-char) of the challenge to verify
  solvedHeader: z.string(), // Length depends on algorithm (with nonce filled in)
  hash: z.string().length(64), // 32 bytes hex
});

export const VerifyPowProofResponseSchema = z.object({
  valid: z.boolean(),
  message: z.string(),
});
