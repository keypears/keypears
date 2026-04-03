import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getOrCreateKeypear,
  saveMyKeypear,
} from "~/server/keypears.functions";
import { deriveLoginKey, generateAndEncryptKeyPair } from "~/lib/auth";
import { Navbar } from "~/components/Navbar";

export const Route = createFileRoute("/")({
  loader: () => getOrCreateKeypear(),
  component: HomePage,
});

function keypearAddress(id: number) {
  return `${id}@keypears.com`;
}

function HomePage() {
  const data = Route.useLoaderData();
  const [hasPassword, setHasPassword] = useState(data.hasPassword);

  const [addressInput, setAddressInput] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (addressInput !== keypearAddress(data.id)) {
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
    <div className="font-sans">
      <Navbar keypearId={data.id} />
      <div className="flex flex-1 items-center justify-center pt-32">
        <div className="text-center">
          <h1 className="text-foreground text-4xl font-bold">Welcome</h1>
          <p className="text-foreground-dark mt-2">
            Your KeyPears address is{" "}
            <span className="text-accent font-bold">
              {keypearAddress(data.id)}
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
                  className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
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
