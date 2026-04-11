import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { getMyEntries, createEntry } from "~/server/vault.functions";
import { getMyKeys } from "~/server/user.functions";
import { getCachedEncryptionKey, decryptPrivateKey } from "~/lib/auth";
import { encryptVaultEntry } from "~/lib/vault";
import type { VaultEntryData } from "~/lib/vault";
import { FixedBuf } from "@webbuf/fixedbuf";
import {
  calculatePasswordEntropy,
  entropyTier,
  entropyLabel,
  entropyColor,
} from "~/lib/auth";
import { parseDomainInput, validateEmail } from "~/lib/vault-validation";
import {
  KeyRound,
  FileText,
  Lock,
  Plus,
  Search,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_app/_saved/_chrome/vault")({
  head: () => ({ meta: [{ title: "Vault — KeyPears" }] }),
  loader: async () => {
    const [entries, keyData] = await Promise.all([
      getMyEntries(),
      getMyKeys(),
    ]);
    return { entries, keyData };
  },
  component: VaultPage,
});

function VaultPage() {
  const navigate = useNavigate();
  const { entries: initialEntries, keyData } = Route.useLoaderData();
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(initialEntries.length >= 20);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Sync loader data into state on navigation
  useEffect(() => {
    setEntries(initialEntries);
    setHasMore(initialEntries.length >= 20);
  }, [initialEntries]);

  // Build key map
  const [keyMap, setKeyMap] = useState<
    Map<string, { privateKey: FixedBuf<32>; keyNumber: number }>
  >(new Map());
  const [activePublicKey, setActivePublicKey] = useState<string | null>(null);

  useEffect(() => {
    const encryptionKey = getCachedEncryptionKey();
    if (!encryptionKey) return;
    const map = new Map<
      string,
      { privateKey: FixedBuf<32>; keyNumber: number }
    >();
    for (const k of keyData.keys) {
      if (k.loginKeyHash === keyData.passwordHash) {
        try {
          const priv = decryptPrivateKey(k.encryptedPrivateKey, encryptionKey);
          map.set(k.publicKey, { privateKey: priv, keyNumber: k.keyNumber });
        } catch {
          // locked key
        }
      }
    }
    setKeyMap(map);
    if (keyData.keys.length > 0) {
      setActivePublicKey(keyData.keys[0].publicKey);
    }
  }, [keyData]);

  // Search with debounce
  function handleSearch(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await getMyEntries({
        data: { query: value || undefined },
      });
      setEntries(results);
      setHasMore(results.length >= 20);
    }, 300);
  }

  async function loadMore() {
    if (loadingMore || !hasMore || entries.length === 0) return;
    setLoadingMore(true);
    try {
      const older = await getMyEntries({
        data: {
          query: query || undefined,
          beforeId: entries[entries.length - 1].id,
        },
      });
      if (older.length < 20) setHasMore(false);
      setEntries((prev) => [...prev, ...older]);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }

  function getKeyNumber(publicKey: string): number | null {
    const k = keyMap.get(publicKey);
    if (k) return k.keyNumber;
    const match = keyData.keys.find((key) => key.publicKey === publicKey);
    return match?.keyNumber ?? null;
  }

  function isLocked(publicKey: string): boolean {
    return !keyMap.has(publicKey);
  }

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <div className="flex items-center justify-between">
        <h1 className="text-foreground text-2xl font-bold">Vault</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-all"
        >
          <Plus className="h-4 w-4" />
          New Entry
        </button>
      </div>

      {/* Search */}
      <div className="relative mt-4">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search vault..."
          autoFocus
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="bg-background-dark border-border text-foreground w-full rounded border py-2 pr-4 pl-10 text-sm"
        />
      </div>

      {/* Create form */}
      {creating && (
        <CreateEntryForm
          activePublicKey={activePublicKey}
          keyMap={keyMap}
          onCreated={(id: string) => {
            navigate({ to: "/vault/$id", params: { id } });
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Entry list */}
      {entries.length === 0 ? (
        <div className="mt-8 text-center">
          <Lock className="text-muted-foreground mx-auto h-12 w-12" />
          <p className="text-muted-foreground mt-4">
            {query ? "No matching entries." : "Your vault is empty."}
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {entries.map((entry) => {
            const keyNum = getKeyNumber(entry.publicKey);
            const locked = isLocked(entry.publicKey);
            const Icon = entry.type === "login" ? KeyRound : FileText;
            return (
              <Link
                key={entry.id}
                to="/vault/$id"
                params={{ id: entry.id }}
                className="border-border/30 hover:bg-accent/5 flex items-center gap-3 rounded border px-4 py-3 no-underline transition-colors"
              >
                {locked ? (
                  <Lock className="text-muted-foreground h-5 w-5 shrink-0" />
                ) : (
                  <Icon className="text-muted-foreground h-5 w-5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-sm font-medium">
                    {entry.name}
                  </span>
                  {entry.searchTerms && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {entry.searchTerms}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {keyNum !== null && (
                    <span className="text-muted-foreground text-xs">
                      Key #{keyNum}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            );
          })}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-accent hover:text-accent/80 w-full py-4 text-center text-sm disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Show more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreateEntryForm({
  activePublicKey,
  keyMap,
  onCreated,
  onCancel,
}: {
  activePublicKey: string | null;
  keyMap: Map<string, { privateKey: FixedBuf<32>; keyNumber: number }>;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<"login" | "text">("login");
  const [name, setName] = useState("");
  const [searchTerms, setSearchTerms] = useState("");
  const [domain, setDomain] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activePublicKey) return;
    const keyInfo = keyMap.get(activePublicKey);
    if (!keyInfo) return;

    setError("");
    setSaving(true);
    try {
      let data: VaultEntryData;
      if (type === "login") {
        data = {
          type: "login",
          ...(domain && { domain }),
          ...(username && { username }),
          ...(email && { email }),
          ...(password && { password }),
          ...(notes && { notes }),
        };
      } else {
        data = { type: "text", text };
      }

      const encryptedData = encryptVaultEntry(data, keyInfo.privateKey);
      const result = await createEntry({
        data: {
          name,
          type,
          searchTerms,
          publicKey: activePublicKey,
          encryptedData,
        },
      });
      onCreated(result.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border/30 mt-4 rounded border p-4"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-foreground text-lg font-bold">New Entry</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Type selector */}
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setType("login")}
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors ${
            type === "login"
              ? "bg-accent/15 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <KeyRound className="h-4 w-4" />
          Login
        </button>
        <button
          type="button"
          onClick={() => setType("text")}
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors ${
            type === "text"
              ? "bg-accent/15 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4" />
          Text
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {/* Label section — plaintext metadata */}
        <div>
          <h3 className="text-foreground text-sm font-medium">Label</h3>
          <p className="text-muted-foreground mb-2 text-xs">
            Searchable. Visible to the server.
          </p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Name
              </label>
              <input
                type="text"
                placeholder="e.g. Google, AWS, SSH key"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Search terms
              </label>
              <input
                type="text"
                placeholder="e.g. work, production, personal"
                value={searchTerms}
                onChange={(e) => setSearchTerms(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Secret section — encrypted fields */}
        <div>
          <h3 className="text-foreground text-sm font-medium">Secret</h3>
          <p className="text-muted-foreground mb-2 text-xs">
            Encrypted. Only you can see this.
          </p>
        </div>

        {type === "login" ? (
          <>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Domain
              </label>
              <input
                type="text"
                placeholder="e.g. google.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              />
              {domain && (() => {
                const { hint, domain: suggested } = parseDomainInput(domain);
                if (!hint) return null;
                return (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {suggested && suggested !== domain.trim() ? (
                      <>
                        {hint}{" "}
                        <button
                          type="button"
                          onClick={() => setDomain(suggested)}
                          className="text-accent hover:text-accent/80"
                        >
                          Use it
                        </button>
                      </>
                    ) : (
                      hint
                    )}
                  </p>
                );
              })()}
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Email
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              />
              {email && validateEmail(email) && (
                <p className="mt-1 text-xs text-yellow-500">
                  {validateEmail(email)}
                </p>
              )}
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              />
              {password && (
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
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
                rows={3}
              />
            </div>
          </>
        ) : (
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              Text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              rows={5}
              required
            />
          </div>
        )}

        {error && <p className="text-danger text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving || !activePublicKey}
          className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 text-sm transition-all disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
