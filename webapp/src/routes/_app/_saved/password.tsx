import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  getMyEncryptedKeys,
  changeMyPassword,
} from "~/server/user.functions";
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

export const Route = createFileRoute("/_app/_saved/password")({
  component: PasswordPage,
});

function PasswordPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [currentTier, setCurrentTier] = useState<ReturnType<
    typeof getCachedEntropyTier
  >>(null);
  useEffect(() => {
    setCurrentTier(getCachedEntropyTier());
  }, []);

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

      // 3. Decrypt all with old encryption key, re-encrypt with new
      setStatus("Re-encrypting keys...");
      const newPasswordKey = derivePasswordKey(newPassword);
      const newEncryptionKey =
        deriveEncryptionKeyFromPasswordKey(newPasswordKey);
      const newLoginKey = deriveLoginKeyFromPasswordKey(newPasswordKey);

      const reEncryptedKeys = encryptedKeys.map(
        (key: { id: number; encryptedPrivateKey: string }) => {
          const privateKey = decryptPrivateKey(
            key.encryptedPrivateKey,
            oldEncryptionKey,
          );
          const reEncrypted = acs2Encrypt(privateKey.buf, newEncryptionKey);
          return {
            id: key.id,
            encryptedPrivateKey: reEncrypted.toHex(),
          };
        },
      );

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
      window.location.href = "/inbox";
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
        All your encrypted keys will be re-encrypted with your new password.
      </p>
      {currentTier === "red" && (
        <p className="text-destructive mt-3 text-sm font-medium">
          Your current password is weak. Choose a stronger one.
        </p>
      )}
      {currentTier === "yellow" && (
        <p className="text-yellow-500 mt-3 text-sm font-medium">
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
        {status && (
          <p className="text-muted-foreground text-sm">{status}</p>
        )}
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
