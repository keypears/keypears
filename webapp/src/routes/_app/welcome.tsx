import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { getMyUser, saveMyUser, deleteMyUser } from "~/server/user.functions";
import { getServerDomain } from "~/server/config.functions";
import {
  derivePasswordKey,
  deriveLoginKeyFromPasswordKey,
  deriveEncryptionKeyFromPasswordKey,
  generateAndEncryptKeyPairFromEncryptionKey,
  cacheEncryptionKey,
  calculatePasswordEntropy,
  entropyTier,
  entropyLabel,
  entropyColor,
  cacheEntropyTier,
} from "~/lib/auth";
import { Footer } from "~/components/Footer";

export const Route = createFileRoute("/_app/welcome")({
  loader: async () => {
    const user = await getMyUser();
    if (!user) throw new Error("Not logged in");
    const domain = await getServerDomain();
    return { ...user, domain };
  },
  component: WelcomePage,
});

function WelcomePage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const passwordKey = derivePasswordKey(password);
      const loginKey = deriveLoginKeyFromPasswordKey(passwordKey);
      const encryptionKey = deriveEncryptionKeyFromPasswordKey(passwordKey);
      const { publicKey, encryptedPrivateKey } =
        generateAndEncryptKeyPairFromEncryptionKey(encryptionKey);
      cacheEncryptionKey(encryptionKey);
      const entropy = calculatePasswordEntropy(password);
      cacheEntropyTier(entropyTier(entropy));
      await saveMyUser({
        data: { name: name.trim(), loginKey, publicKey, encryptedPrivateKey },
      });
      // Full reload so the sidebar picks up the new entropy tier from localStorage
      window.location.href = "/inbox";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col font-sans">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-foreground text-4xl font-bold">
            Choose Your Name
          </h1>
          <p className="text-foreground-dark mt-2">
            Your KeyPears address will be{" "}
            <span className="text-accent font-bold">
              {name || "name"}@{data.domain}
            </span>
          </p>

          <div className="mt-8">
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Choose a name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
                required
              />
              <div>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2"
                  required
                />
                {password.length > 0 && (
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {password.length} characters
                    </span>
                    <span
                      className={entropyColor(
                        entropyTier(calculatePasswordEntropy(password)),
                      )}
                    >
                      {calculatePasswordEntropy(password).toFixed(1)} bits —{" "}
                      {entropyLabel(
                        entropyTier(calculatePasswordEntropy(password)),
                      )}
                    </span>
                  </div>
                )}
              </div>
              <input
                type="password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
                required
              />
              {error && <p className="text-danger text-sm">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </form>
            <button
              onClick={async () => {
                await deleteMyUser();
                navigate({ to: "/" });
              }}
              className="text-muted-foreground hover:text-destructive mt-4 cursor-pointer text-xs transition-colors"
            >
              Delete my account
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
