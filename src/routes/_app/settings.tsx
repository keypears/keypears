import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { getMyKeys, rotateKey } from "~/server/user.functions";
import { generateAndEncryptKeyPair } from "~/lib/auth";
import { KeyRound, RotateCw } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  loader: () => getMyKeys(),
  component: SettingsPage,
});

function SettingsPage() {
  const initialKeys = Route.useLoaderData();
  const [keyList, setKeyList] = useState(initialKeys);
  const [rotating, setRotating] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showRotateForm, setShowRotateForm] = useState(false);

  async function handleRotate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!password) {
      setError("Password is required to rotate keys.");
      return;
    }
    setRotating(true);
    try {
      const { publicKey, encryptedPrivateKey } =
        generateAndEncryptKeyPair(password);
      const result = await rotateKey({
        data: { publicKey, encryptedPrivateKey },
      });
      setKeyList([
        {
          keyNumber: result.keyNumber,
          publicKey,
          createdAt: new Date(),
        },
        ...keyList.slice(0, 9),
      ]);
      setPassword("");
      setShowRotateForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to rotate key.");
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-foreground text-2xl font-bold">Settings</h1>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-lg font-semibold">Keys</h2>
          {!showRotateForm && keyList.length > 0 && (
            <button
              onClick={() => setShowRotateForm(true)}
              className="bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-all duration-300"
            >
              <RotateCw className="h-4 w-4" />
              Rotate Key
            </button>
          )}
        </div>

        {showRotateForm && (
          <form
            onSubmit={handleRotate}
            className="border-border/30 mt-4 rounded border p-4"
          >
            <p className="text-foreground-dark mb-3 text-sm">
              Enter your password to generate a new key pair.
            </p>
            <div className="flex gap-3">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background-dark border-border text-foreground flex-1 rounded border px-3 py-2 text-sm"
                required
              />
              <button
                type="submit"
                disabled={rotating}
                className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 text-sm transition-all duration-300 disabled:opacity-50"
              >
                {rotating ? "Rotating..." : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRotateForm(false);
                  setPassword("");
                  setError("");
                }}
                className="text-muted-foreground hover:text-foreground rounded px-3 py-2 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
            {error && <p className="text-danger mt-2 text-sm">{error}</p>}
          </form>
        )}

        {keyList.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            No keys yet. Save your account to generate your first key.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {keyList.map((key, i) => (
              <div
                key={key.keyNumber}
                className={`border-border/30 flex items-center gap-3 rounded border px-4 py-3 ${
                  i === 0 ? "bg-accent/5" : ""
                }`}
              >
                <KeyRound
                  className={`h-4 w-4 ${i === 0 ? "text-accent" : "text-muted-foreground"}`}
                />
                <div className="flex-1">
                  <span className="text-foreground text-sm font-medium">
                    Key #{key.keyNumber}
                  </span>
                  {i === 0 && (
                    <span className="text-accent ml-2 text-xs">Active</span>
                  )}
                </div>
                <span className="text-muted-foreground text-xs">
                  {new Date(key.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
