import { sha256Hmac } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { aesgcmEncryptNative, aesgcmDecryptNative } from "./aesgcm";
import { z } from "zod";

// --- Vault key derivation ---

export function deriveVaultKey(encryptionKey: FixedBuf<32>): FixedBuf<32> {
  return sha256Hmac(encryptionKey.buf, WebBuf.fromUtf8("vault-key-v2"));
}

// --- Blob schemas ---

export const LoginFields = z.object({
  type: z.literal("login"),
  domain: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
  notes: z.string().optional(),
});

export const TextFields = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const VaultEntryData = z.discriminatedUnion("type", [
  LoginFields,
  TextFields,
]);
export type VaultEntryData = z.infer<typeof VaultEntryData>;

// --- Encrypt / decrypt ---

export async function encryptVaultEntry(
  data: VaultEntryData,
  encryptionKey: FixedBuf<32>,
): Promise<WebBuf> {
  const vaultKey = deriveVaultKey(encryptionKey);
  const json = JSON.stringify(data);
  return aesgcmEncryptNative(WebBuf.fromUtf8(json), vaultKey);
}

export async function decryptVaultEntry(
  encrypted: WebBuf,
  encryptionKey: FixedBuf<32>,
): Promise<VaultEntryData> {
  const vaultKey = deriveVaultKey(encryptionKey);
  const decrypted = await aesgcmDecryptNative(encrypted, vaultKey);
  return VaultEntryData.parse(JSON.parse(decrypted.toUtf8()));
}

export type DecryptResult =
  | { ok: true; data: VaultEntryData }
  | { ok: false; reason: "locked" | "invalid"; raw?: string };

export async function tryDecryptVaultEntry(
  encrypted: WebBuf,
  encryptionKey: FixedBuf<32>,
): Promise<DecryptResult> {
  try {
    const vaultKey = deriveVaultKey(encryptionKey);
    const decrypted = await aesgcmDecryptNative(encrypted, vaultKey);
    const json = decrypted.toUtf8();
    const parsed = VaultEntryData.safeParse(JSON.parse(json));
    if (parsed.success) {
      return { ok: true, data: parsed.data };
    }
    return { ok: false, reason: "invalid", raw: json };
  } catch {
    return { ok: false, reason: "locked" };
  }
}
