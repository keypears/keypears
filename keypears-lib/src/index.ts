import { z } from "zod";
import { acb3Encrypt, acb3Decrypt } from "@webbuf/acb3";
import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "@webbuf/fixedbuf";
import { blake3Hash } from "@webbuf/blake3";

// for all lowercase letters, 16 chars is ~75 bits of entropy
export const PasswordSchema = z.string().min(16).max(128);

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

export function encryptFolderKey(password: string, key: FixedBuf<32>): WebBuf {
  const hashedPassword = blake3Hash(WebBuf.fromUtf8(password));
  return acb3Encrypt(key.buf, hashedPassword);
}

export function decryptFolderKey(
  password: string,
  encryptedKey: WebBuf,
): FixedBuf<32> {
  const hashedPassword = blake3Hash(WebBuf.fromUtf8(password));
  const decrypted = acb3Decrypt(encryptedKey, hashedPassword);
  return FixedBuf.fromBuf(32, decrypted);
}
