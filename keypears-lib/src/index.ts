import { z } from "zod";

export const SecretUpdateSchema = z.object({
  id: z.ulid(), // id of this update
  secretId: z.ulid(), // id of the secret being updated
  name: z.string().min(1).max(255),
  domain: z.string().optional(),
  label: z.string().optional(),
  secretType: z.enum([
    "password",
    "env_var",
    "api_key",
    "cryptocurrency_key",
    "cryptocurrency_wallet",
  ]),
  encryptedSecret: z.string().optional(), // encrypted secret data
  createdAt: z.iso.datetime(),
  deleted: z.boolean().optional(), // soft delete for sync purposes
});
