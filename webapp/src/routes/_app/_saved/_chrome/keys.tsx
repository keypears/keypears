import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getMyKeys, rotateKey, reEncryptMyKey } from "~/server/user.functions";
import {
  getCachedEncryptionKey,
  derivePasswordKey,
  deriveLoginKeyFromPasswordKey,
  deriveEncryptionKeyFromPasswordKey,
  generateAndEncryptKeyPairFromEncryptionKey,
  cacheEncryptionKey,
  decryptSigningKey,
  decryptDecapKey,
  decryptEd25519Key,
  decryptX25519Key,
} from "~/lib/auth";
import { aesgcmEncryptNative } from "~/lib/aesgcm";
import { WebBuf } from "@webbuf/webbuf";
import { RotateCw, Lock, Unlock, X } from "lucide-react";

export const Route = createFileRoute("/_app/_saved/_chrome/keys")({
  head: () => ({ meta: [{ title: "Keys — KeyPears" }] }),
  loader: () => getMyKeys(),
  component: KeysPage,
});

function KeysPage() {
  const { keys: keyList, passwordHash } = Route.useLoaderData();
  const router = useRouter();
  const [rotating, setRotating] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [changingKeyId, setChangingKeyId] = useState<string | null>(null);
  const [oldKeyPassword, setOldKeyPassword] = useState("");
  const [newKeyPassword, setNewKeyPassword] = useState("");
  const [keyError, setKeyError] = useState("");
  const [keyStatus, setKeyStatus] = useState("");

  function isKeyActive(key: { loginKeyHash: string | null }): boolean {
    if (!passwordHash || !key.loginKeyHash) return false;
    return key.loginKeyHash === passwordHash;
  }

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
      const passwordKey = await derivePasswordKey(password);
      encryptionKey = await deriveEncryptionKeyFromPasswordKey(passwordKey);
      cacheEncryptionKey(encryptionKey);
    }

    setRotating(true);
    try {
      const keyPair =
        await generateAndEncryptKeyPairFromEncryptionKey(encryptionKey);
      await rotateKey({
        data: {
          ed25519PublicKey: keyPair.ed25519PublicKey.toHex(),
          encryptedEd25519Key: keyPair.encryptedEd25519Key.toHex(),
          x25519PublicKey: keyPair.x25519PublicKey.toHex(),
          encryptedX25519Key: keyPair.encryptedX25519Key.toHex(),
          signingPublicKey: keyPair.signingPublicKey.toHex(),
          encapPublicKey: keyPair.encapPublicKey.toHex(),
          encryptedSigningKey: keyPair.encryptedSigningKey.toHex(),
          encryptedDecapKey: keyPair.encryptedDecapKey.toHex(),
        },
      });
      await router.invalidate();
      setPassword("");
      setNeedsPassword(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to rotate key.");
    } finally {
      setRotating(false);
    }
  }

  async function handleReEncrypt(e: React.FormEvent) {
    e.preventDefault();
    if (!changingKeyId) return;
    setKeyError("");
    setKeyStatus("");

    try {
      setKeyStatus("Deriving keys...");
      const oldPasswordKey = await derivePasswordKey(oldKeyPassword);
      const oldEncryptionKey =
        await deriveEncryptionKeyFromPasswordKey(oldPasswordKey);

      const newPasswordKey = await derivePasswordKey(newKeyPassword);
      const newEncryptionKey =
        await deriveEncryptionKeyFromPasswordKey(newPasswordKey);
      const newLoginKey = await deriveLoginKeyFromPasswordKey(newPasswordKey);

      const key = keyList.find((k) => k.id === changingKeyId);
      if (!key) throw new Error("Key not found");

      setKeyStatus("Decrypting...");
      const ed25519Key = await decryptEd25519Key(
        WebBuf.fromHex(key.encryptedEd25519Key),
        oldEncryptionKey,
      );
      const x25519Key = await decryptX25519Key(
        WebBuf.fromHex(key.encryptedX25519Key),
        oldEncryptionKey,
      );
      const signingKey = await decryptSigningKey(
        WebBuf.fromHex(key.encryptedSigningKey),
        oldEncryptionKey,
      );
      const decapKey = await decryptDecapKey(
        WebBuf.fromHex(key.encryptedDecapKey),
        oldEncryptionKey,
      );

      setKeyStatus("Re-encrypting...");
      const reEncEd25519Key = await aesgcmEncryptNative(
        ed25519Key.buf,
        newEncryptionKey,
      );
      const reEncX25519Key = await aesgcmEncryptNative(
        x25519Key.buf,
        newEncryptionKey,
      );
      const reEncSigningKey = await aesgcmEncryptNative(
        signingKey.buf,
        newEncryptionKey,
      );
      const reEncDecapKey = await aesgcmEncryptNative(
        decapKey.buf,
        newEncryptionKey,
      );

      setKeyStatus("Saving...");
      await reEncryptMyKey({
        data: {
          keyId: changingKeyId,
          encryptedEd25519Key: reEncEd25519Key.toHex(),
          encryptedX25519Key: reEncX25519Key.toHex(),
          encryptedSigningKey: reEncSigningKey.toHex(),
          encryptedDecapKey: reEncDecapKey.toHex(),
          loginKey: newLoginKey,
        },
      });

      await router.invalidate();
      setChangingKeyId(null);
      setOldKeyPassword("");
      setNewKeyPassword("");
      setKeyStatus("");
    } catch (err: unknown) {
      setKeyError(
        err instanceof Error ? err.message : "Failed to re-encrypt key.",
      );
      setKeyStatus("");
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-foreground text-2xl font-bold">Keys</h1>

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
            {keyList.map((key, i) => {
              const active = isKeyActive(key);
              return (
                <div key={key.keyNumber}>
                  <div
                    className={`border-border/30 flex items-center gap-3 rounded border px-4 py-3 ${
                      active ? "bg-accent/5" : "bg-background-dark/50"
                    }`}
                  >
                    {active ? (
                      <Unlock className="text-accent h-4 w-4" />
                    ) : (
                      <Lock className="text-muted-foreground h-4 w-4" />
                    )}
                    <div className="flex-1">
                      <span className="text-foreground text-sm font-medium">
                        Key #{key.keyNumber}
                      </span>
                      {i === 0 && (
                        <span className="text-accent ml-2 text-xs">
                          Current
                        </span>
                      )}
                      {active ? (
                        <span className="ml-2 text-xs text-green-500">
                          Active
                        </span>
                      ) : (
                        <span className="text-muted-foreground ml-2 text-xs">
                          Locked
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setChangingKeyId(
                          changingKeyId === key.id ? null : key.id,
                        );
                        setOldKeyPassword("");
                        setNewKeyPassword("");
                        setKeyError("");
                        setKeyStatus("");
                      }}
                      className="text-muted-foreground hover:text-foreground text-xs underline"
                    >
                      {changingKeyId === key.id ? "Cancel" : "Change password"}
                    </button>
                    <span className="text-muted-foreground text-xs">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {changingKeyId === key.id && (
                    <form
                      onSubmit={handleReEncrypt}
                      className="border-border/30 rounded-b border border-t-0 px-4 py-3"
                    >
                      <div className="flex flex-col gap-3">
                        <input
                          type="password"
                          placeholder="Current password for this key"
                          value={oldKeyPassword}
                          onChange={(e) => setOldKeyPassword(e.target.value)}
                          className="bg-background-dark border-border text-foreground rounded border px-3 py-2 text-sm"
                          required
                        />
                        <input
                          type="password"
                          placeholder="New password for this key"
                          value={newKeyPassword}
                          onChange={(e) => setNewKeyPassword(e.target.value)}
                          className="bg-background-dark border-border text-foreground rounded border px-3 py-2 text-sm"
                          required
                        />
                        {keyError && (
                          <p className="text-danger text-sm">{keyError}</p>
                        )}
                        {keyStatus && (
                          <p className="text-muted-foreground text-sm">
                            {keyStatus}
                          </p>
                        )}
                        <div className="flex gap-3">
                          <button
                            type="submit"
                            className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 text-sm transition-all"
                          >
                            Re-encrypt
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setChangingKeyId(null);
                              setKeyError("");
                              setKeyStatus("");
                            }}
                            className="text-muted-foreground hover:text-foreground text-sm"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
