import { z } from "zod";
import { acb3Encrypt, acb3Decrypt } from "@webbuf/acb3";
import { WebBuf } from "@webbuf/webbuf";
import { FixedBuf } from "@webbuf/fixedbuf";
import { blake3Hash, blake3Mac } from "@webbuf/blake3";

// for all lowercase letters, 16 chars is ~75 bits of entropy
export const PasswordSchema = z.string().min(16).max(128);

export const SecretUpdateSchema = z.object({
  id: z.ulid(), // id of this update
  secretId: z.ulid(), // id of the secret being updated
  name: z.string().min(1).max(255),
  domain: z.string().optional(),
  label: z.string().optional(),
  secretType: z.enum(["password", "env-var", "api-key", "cryptocurrency-key"]),
  encryptedSecret: z.string().optional(), // encrypted secret data
  createdAt: z.iso.datetime(),
  deleted: z.boolean().optional(), // soft delete for sync purposes
});

export function generateKey(): FixedBuf<32> {
  return FixedBuf.fromRandom(32);
}

export function hashSecretFolderKey(key: FixedBuf<32>): FixedBuf<32> {
  return blake3Hash(key.buf);
}

export function derivePasswordKeyTemplate(
  password: string,
  salt: FixedBuf<32>,
  rounds: number = 100_000,
): FixedBuf<32> {
  if (rounds < 1) {
    throw new Error("Rounds must be at least 1");
  }

  // Convert password to WebBuf
  const passwordBuf = WebBuf.fromUtf8(password);

  // First round: MAC(salt, password)
  let result = blake3Mac(salt, passwordBuf);

  // Subsequent rounds: MAC(salt, previous_result)
  for (let i = 1; i < rounds; i++) {
    result = blake3Mac(salt, result.buf);
  }

  return result;
}

// Generate a deterministic but unique salt from password
export function derivePasswordSalt(password: string): FixedBuf<32> {
  const context = blake3Hash(WebBuf.fromUtf8("KeyPears password salt v1"));
  const passwordBuf = WebBuf.fromUtf8(password);
  return blake3Mac(context, passwordBuf);
}

export function derivePasswordKey(password: string): FixedBuf<32> {
  const salt = derivePasswordSalt(password);
  return derivePasswordKeyTemplate(password, salt, 100_000);
}

export function encryptKey(
  password: string,
  key: FixedBuf<32>,
  iv?: FixedBuf<16>,
): WebBuf {
  const hashedPassword = derivePasswordKey(password);
  return acb3Encrypt(key.buf, hashedPassword, iv);
}

export function decryptKey(
  password: string,
  encryptedKey: WebBuf,
): FixedBuf<32> {
  const hashedPassword = derivePasswordKey(password);
  const decrypted = acb3Decrypt(encryptedKey, hashedPassword);
  return FixedBuf.fromBuf(32, decrypted);
}
