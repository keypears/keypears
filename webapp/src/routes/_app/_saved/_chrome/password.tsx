import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { getMyEncryptedKeys, changeMyPassword } from "~/server/user.functions";
import {
  derivePasswordKey,
  deriveLoginKeyFromPasswordKey,
  deriveEncryptionKeyFromPasswordKey,
  getCachedEncryptionKey,
  cacheEncryptionKey,
  decryptPrivateKey,
  calculatePasswordEntropy,
  entropyTier,
  entropyLabel,
  entropyColor,
  cacheEntropyTier,
  getCachedEntropyTier,
} from "~/lib/auth";
import { acs2Encrypt } from "@webbuf/acs2";

export const Route = createFileRoute("/_app/_saved/_chrome/password")({
  head: () => ({ meta: [{ title: "Change Password — KeyPears" }] }),
  component: PasswordPage,
});

function PasswordPage() {
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
        const oldPasswordKey = derivePasswordKey(oldPassword);
        oldEncryptionKey = deriveEncryptionKeyFromPasswordKey(oldPasswordKey);
      }

      // 2. Fetch all encrypted private keys from server
      setStatus("Fetching keys...");
      const encryptedKeys = await getMyEncryptedKeys();

      // 3. Decrypt only keys that match current password, re-encrypt with new
      setStatus("Re-encrypting keys...");
      const newPasswordKey = derivePasswordKey(newPassword);
      const newEncryptionKey =
        deriveEncryptionKeyFromPasswordKey(newPasswordKey);
      const newLoginKey = deriveLoginKeyFromPasswordKey(newPasswordKey);

      const reEncryptedKeys: { id: string; encryptedPrivateKey: string }[] =
        [];
      for (const key of encryptedKeys) {
        try {
          const privateKey = decryptPrivateKey(
            key.encryptedPrivateKey,
            oldEncryptionKey,
          );
          const reEncrypted = acs2Encrypt(privateKey.buf, newEncryptionKey);
          reEncryptedKeys.push({
            id: key.id,
            encryptedPrivateKey: reEncrypted.toHex(),
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

      // Full reload so the sidebar re-reads the updated entropy tier from localStorage
      window.location.href = "/feed";
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
      <h1 className="text-foreground text-2xl font-bold">Change Password</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Keys encrypted with your current password will be re-encrypted with
        your new password. Keys under a different password will be unchanged.
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
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
          required
        />
        {error && <p className="text-danger text-sm">{error}</p>}
        {status && <p className="text-muted-foreground text-sm">{status}</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
        >
          {saving ? "Changing..." : "Change Password"}
        </button>
      </form>
    </div>
  );
}
