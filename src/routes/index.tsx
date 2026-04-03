import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  getMyKeypear,
  createKeypear,
  saveMyKeypear,
} from "~/server/keypears.functions";
import { deriveLoginKey, generateAndEncryptKeyPair } from "~/lib/auth";
import { Navbar } from "~/components/Navbar";

export const Route = createFileRoute("/")({
  ssr: false,
  component: HomePage,
});

function keypearAddress(id: number) {
  return `${id}@keypears.com`;
}

function HomePage() {
  const [keypearId, setKeypearId] = useState<number | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [checking, setChecking] = useState(true);

  const [addressInput, setAddressInput] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const existing = await getMyKeypear();
        if (existing) {
          setKeypearId(existing.id);
          setHasPassword(existing.hasPassword);
        } else {
          const created = await createKeypear();
          setKeypearId(created.id);
        }
      } catch (err) {
        console.error("Failed to initialize keypear:", err);
      } finally {
        setChecking(false);
      }
    }
    init();
  }, []);

  if (checking || keypearId == null) {
    return <div className="bg-background min-h-screen" />;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (addressInput !== keypearAddress(keypearId!)) {
      setError("KeyPears address does not match.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const loginKey = deriveLoginKey(password);
      const { publicKey, encryptedPrivateKey } =
        generateAndEncryptKeyPair(password);
      await saveMyKeypear({
        data: { loginKey, publicKey, encryptedPrivateKey },
      });
      setHasPassword(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-background min-h-screen font-sans">
      <Navbar keypearId={keypearId} />
      <div className="flex flex-1 items-center justify-center pt-32">
        <div className="text-center">
          <h1 className="text-accent text-4xl font-bold">Welcome</h1>
          <p className="text-foreground-dark mt-2">
            Your KeyPears address is{" "}
            <span className="text-accent font-bold">
              {keypearAddress(keypearId)}
            </span>
          </p>
          {!hasPassword && (
            <div className="mt-8 w-full max-w-sm">
              <p className="text-foreground-dark mb-4 text-sm">
                Set a password to keep your address forever.
              </p>
              <form onSubmit={handleSave} className="flex flex-col gap-4">
                <input
                  type="text"
                  placeholder="Your KeyPears address"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background-dark border-border text-foreground rounded border px-4 py-2"
                  required
                />
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
                  className="bg-accent/15 border-accent/50 hover:bg-accent/30 text-accent rounded border px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
