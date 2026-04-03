import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { getMyKeys, rotateKey } from "~/server/user.functions";
import {
  getCachedEncryptionKey,
  derivePasswordKey,
  deriveEncryptionKeyFromPasswordKey,
  generateAndEncryptKeyPairFromEncryptionKey,
  cacheEncryptionKey,
} from "~/lib/auth";
import { KeyRound, RotateCw } from "lucide-react";

export const Route = createFileRoute("/_app/_saved/keys")({
  loader: () => getMyKeys(),
  component: KeysPage,
});

function KeysPage() {
  const initialKeys = Route.useLoaderData();
  const [keyList, setKeyList] = useState(initialKeys);
  const [rotating, setRotating] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);

  async function handleRotate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError("");

    let encryptionKey = getCachedEncryptionKey();

    if (!encryptionKey) {
      if (!needsPassword) {
        setNeedsPassword(true);
        return;
      }
      if (!password) {
        setError("Password is required.");
        return;
      }
      const passwordKey = derivePasswordKey(password);
      encryptionKey = deriveEncryptionKeyFromPasswordKey(passwordKey);
      cacheEncryptionKey(encryptionKey);
    }

    setRotating(true);
    try {
      const { publicKey, encryptedPrivateKey } =
        generateAndEncryptKeyPairFromEncryptionKey(encryptionKey);
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
      setNeedsPassword(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to rotate key.");
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-foreground text-2xl font-bold">Key Rotation</h1>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          {keyList.length > 0 && !needsPassword && (
            <button
              onClick={() => handleRotate()}
              disabled={rotating}
              className="bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-all duration-300 disabled:opacity-50"
            >
              <RotateCw className="h-4 w-4" />
              {rotating ? "Rotating..." : "Rotate Key"}
            </button>
          )}
        </div>

        {needsPassword && (
          <form
            onSubmit={handleRotate}
            className="border-border/30 mt-4 rounded border p-4"
          >
            <p className="text-foreground-dark mb-3 text-sm">
              Enter your password to continue.
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
                  setNeedsPassword(false);
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

        {!needsPassword && error && (
          <p className="text-danger mt-4 text-sm">{error}</p>
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
