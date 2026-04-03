import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { getMyKeypear, saveMyKeypear } from "~/server/keypears.functions";
import { deriveLoginKey, generateAndEncryptKeyPair } from "~/lib/auth";

export const Route = createFileRoute("/save")({
  ssr: false,
  component: SavePage,
});

function SavePage() {
  const [keypearId, setKeypearId] = useState<number | null>(null);
  const [numberInput, setNumberInput] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getMyKeypear()
      .then((result) => {
        if (!result) {
          window.location.href = "/";
        } else if (result.hasPassword) {
          window.location.href = "/home";
        } else {
          setKeypearId(result.id);
        }
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking || keypearId == null) {
    return <div className="bg-background min-h-screen" />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (Number(numberInput) !== keypearId) {
      setError("Keypear number does not match.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const loginKey = deriveLoginKey(password);
      const { publicKey, encryptedPrivateKey } =
        generateAndEncryptKeyPair(password);
      await saveMyKeypear({
        data: { loginKey, publicKey, encryptedPrivateKey },
      });
      window.location.href = "/home";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center font-sans">
      <div className="w-full max-w-sm">
        <h1 className="text-accent mb-2 text-center text-3xl font-bold">
          Save Your Number
        </h1>
        <p className="text-foreground-dark mb-6 text-center text-sm">
          Set a password to keep keypear #
          {new Intl.NumberFormat().format(keypearId)} forever.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="number"
            placeholder="Your keypear number"
            value={numberInput}
            onChange={(e) => setNumberInput(e.target.value)}
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
            disabled={loading}
            className="bg-accent/15 border-accent/50 hover:bg-accent/30 text-accent rounded border px-4 py-2 font-sans transition-all duration-300 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
