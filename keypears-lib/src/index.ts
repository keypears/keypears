import { z } from "zod";
import { acb3Encrypt, acb3Decrypt } from "@webbuf/acb3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { blake3Hash } from "@webbuf/blake3";

export const SecretUpdateSchema = z.object({
  id: z.ulid(), // id of this update
  secretId: z.ulid(), // id of the secret being updated
  name: z.string().min(1).max(255),
  domain: z.string().optional(),
  label: z.string().optional(),
  secretType: z.enum(["password", "env_var", "api_key", "cryptocurrency_key"]),
  encryptedSecret: z.string().optional(), // encrypted secret data
  createdAt: z.iso.datetime(),
  deleted: z.boolean().optional(), // soft delete for sync purposes
});

export function generateSecretFolderKey(): FixedBuf<32> {
  return FixedBuf.fromRandom(32);
}

export function hashSecretFolderKey(key: FixedBuf<32>): FixedBuf<32> {
  return blake3Hash(key.buf);
}
