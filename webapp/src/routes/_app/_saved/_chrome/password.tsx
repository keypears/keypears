import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { getMyEncryptedKeys, changeMyPassword } from "~/server/user.functions";
import {
  derivePasswordKey,
  deriveLoginKeyFromPasswordKey,
  deriveEncryptionKeyFromPasswordKey,
  getCachedEncryptionKey,
  cacheEncryptionKey,
  calculatePasswordEntropy,
  entropyTier,
  entropyLabel,
  entropyColor,
  cacheEntropyTier,
  getCachedEntropyTier,
} from "~/lib/auth";
import { aesgcmEncryptNative, aesgcmDecryptNative } from "~/lib/aesgcm";
import { WebBuf } from "@webbuf/webbuf";

export const Route = createFileRoute("/_app/_saved/_chrome/password")({
  head: () => ({ meta: [{ title: "Password — KeyPears" }] }),
  component: PasswordPage,
});

function PasswordPage() {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const currentTier = getCachedEntropyTier();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword === oldPassword) {
      setError("New password must be different from old password.");
      return;
    }

    setSaving(true);
    try {
      // 1. Get old encryption key (cached or derive from old password)
      setStatus("Deriving old keys...");
      let oldEncryptionKey = getCachedEncryptionKey();
      if (!oldEncryptionKey) {
        const oldPasswordKey = await derivePasswordKey(oldPassword);
        oldEncryptionKey =
          await deriveEncryptionKeyFromPasswordKey(oldPasswordKey);
      }

      // 2. Fetch all encrypted private keys from server
      setStatus("Fetching keys...");
      const encryptedKeys = await getMyEncryptedKeys();

      // 3. Decrypt only keys that match current password, re-encrypt with new
      setStatus("Re-encrypting keys...");
      const newPasswordKey = await derivePasswordKey(newPassword);
      const newEncryptionKey =
        await deriveEncryptionKeyFromPasswordKey(newPasswordKey);
      const newLoginKey = await deriveLoginKeyFromPasswordKey(newPasswordKey);

      const reEncryptedKeys: { id: string; encryptedEd25519Key: string; encryptedX25519Key: string; encryptedSigningKey: string; encryptedDecapKey: string }[] = [];
      for (const key of encryptedKeys) {
        try {
          const ed25519KeyBuf = await aesgcmDecryptNative(
            WebBuf.fromHex(key.encryptedEd25519Key),
            oldEncryptionKey,
          );
          const x25519KeyBuf = await aesgcmDecryptNative(
            WebBuf.fromHex(key.encryptedX25519Key),
            oldEncryptionKey,
          );
          const signingKeyBuf = await aesgcmDecryptNative(
            WebBuf.fromHex(key.encryptedSigningKey),
            oldEncryptionKey,
          );
          const decapKeyBuf = await aesgcmDecryptNative(
            WebBuf.fromHex(key.encryptedDecapKey),
            oldEncryptionKey,
          );
          const reEncEd25519Key = await aesgcmEncryptNative(
            ed25519KeyBuf,
            newEncryptionKey,
          );
          const reEncX25519Key = await aesgcmEncryptNative(
            x25519KeyBuf,
            newEncryptionKey,
          );
          const reEncSigningKey = await aesgcmEncryptNative(
            signingKeyBuf,
            newEncryptionKey,
          );
          const reEncDecapKey = await aesgcmEncryptNative(
            decapKeyBuf,
            newEncryptionKey,
          );
          reEncryptedKeys.push({
            id: key.id,
            encryptedEd25519Key: reEncEd25519Key.toHex(),
            encryptedX25519Key: reEncX25519Key.toHex(),
            encryptedSigningKey: reEncSigningKey.toHex(),
            encryptedDecapKey: reEncDecapKey.toHex(),
          });
        } catch {
          // Key encrypted with a different password — skip it
        }
      }

      // 4. Send to server
      setStatus("Updating password...");
      await changeMyPassword({
        data: {
          newLoginKey,
          reEncryptedKeys,
        },
      });

      // 5. Cache new encryption key and entropy tier
      cacheEncryptionKey(newEncryptionKey);
      cacheEntropyTier(entropyTier(calculatePasswordEntropy(newPassword)));

      navigate({ to: "/home" });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to change password.",
      );
    } finally {
      setSaving(false);
      setStatus("");
    }
  }

  return (
    <div className="mx-auto max-w-md p-8 font-sans">
      <h1 className="text-foreground text-2xl font-bold">Password</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Keys encrypted with your current password will be re-encrypted with your
        new password. Keys under a different password will be unchanged.
      </p>
      {currentTier === "red" && (
        <p className="text-destructive mt-3 text-sm font-medium">
          Your current password is weak. Choose a stronger one.
        </p>
      )}
      {currentTier === "yellow" && (
        <p className="mt-3 text-sm font-medium text-yellow-500">
          Your current password is fair. Consider a stronger one.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <input
          type="password"
          placeholder="Current password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
          required
        />
        <div>
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2"
            required
          />
          {newPassword.length > 0 && (
            <div className="mt-1 flex justify-between text-xs">
              <span className="text-muted-foreground">
                {newPassword.length} characters
              </span>
              <span
                className={entropyColor(
                  entropyTier(calculatePasswordEntropy(newPassword)),
                )}
              >
                {calculatePasswordEntropy(newPassword).toFixed(1)} bits —{" "}
                {entropyLabel(
                  entropyTier(calculatePasswordEntropy(newPassword)),
                )}
              </span>
            </div>
          )}
        </div>
        <div>
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2"
            required
          />
          {confirm.length > 0 && newPassword !== confirm && (
            <p className="text-destructive mt-1 text-xs">
              Passwords do not match
            </p>
          )}
          {confirm.length > 0 && newPassword === confirm && (
            <p className="mt-1 text-xs text-green-500">Passwords match</p>
          )}
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        {status && <p className="text-muted-foreground text-sm">{status}</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
        >
          {saving ? "Changing..." : "Password"}
        </button>
      </form>
    </div>
  );
}
