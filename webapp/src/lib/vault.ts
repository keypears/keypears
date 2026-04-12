import { sha256Hmac } from "@webbuf/sha256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
import { aesgcmEncryptNative, aesgcmDecryptNative } from "./aesgcm";
import { z } from "zod";

// --- Vault key derivation ---

export function deriveVaultKey(privateKey: FixedBuf<32>): FixedBuf<32> {
  return sha256Hmac(privateKey.buf, WebBuf.fromUtf8("vault-key"));
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
  privateKey: FixedBuf<32>,
): Promise<string> {
  const vaultKey = deriveVaultKey(privateKey);
  const json = JSON.stringify(data);
  const encrypted = await aesgcmEncryptNative(WebBuf.fromUtf8(json), vaultKey);
  return encrypted.toHex();
}

export async function decryptVaultEntry(
  hex: string,
  privateKey: FixedBuf<32>,
): Promise<VaultEntryData> {
  const vaultKey = deriveVaultKey(privateKey);
  const decrypted = await aesgcmDecryptNative(WebBuf.fromHex(hex), vaultKey);
  return VaultEntryData.parse(JSON.parse(decrypted.toUtf8()));
}

export type DecryptResult =
  | { ok: true; data: VaultEntryData }
  | { ok: false; reason: "locked" | "invalid"; raw?: string };

export async function tryDecryptVaultEntry(
  hex: string,
  privateKey: FixedBuf<32>,
): Promise<DecryptResult> {
  try {
    const vaultKey = deriveVaultKey(privateKey);
    const decrypted = await aesgcmDecryptNative(WebBuf.fromHex(hex), vaultKey);
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
