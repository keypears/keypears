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
  name: vaultNameSchema,
  domain: z.string().min(1).max(255),
  encryptedPasswordKey: z.string().min(1),
  hashedLoginKey: z.string().length(64), // Blake3 hex = 64 chars
});

export const RegisterVaultResponseSchema = z.object({
  vaultId: z.string(),
});
