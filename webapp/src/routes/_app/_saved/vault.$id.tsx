import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  getMyEntries,
  getEntry,
  updateEntry,
  deleteEntry,
} from "~/server/vault.functions";
import { getMyKeys } from "~/server/user.functions";
import {
  getCachedEncryptionKey,
  decryptPrivateKey,
  calculatePasswordEntropy,
  entropyTier,
  entropyLabel,
  entropyColor,
} from "~/lib/auth";
import { parseDomainInput, validateEmail } from "~/lib/vault-validation";
import {
  tryDecryptVaultEntry,
  encryptVaultEntry,
} from "~/lib/vault";
import type { VaultEntryData } from "~/lib/vault";
import { FixedBuf } from "@webbuf/fixedbuf";
import {
  KeyRound,
  FileText,
  Lock,
  Search,
  Menu,
  X,
  Eye,
  EyeOff,
  Copy,
  Check,
  Pencil,
  Trash2,
  Home,
} from "lucide-react";

export const Route = createFileRoute("/_app/_saved/vault/$id")({
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.entry
          ? `${loaderData.entry.name} — Vault — KeyPears`
          : "Vault — KeyPears",
      },
    ],
  }),
  loader: async ({ params }) => {
    const [entry, entries, keyData] = await Promise.all([
      getEntry({ data: params.id }),
      getMyEntries(),
      getMyKeys(),
    ]);
    return { entryId: params.id, entry, entries, keyData };
  },
  component: VaultDetailPage,
});

function VaultDetailPage() {
  const navigate = useNavigate();
  const { entryId, entry, entries: initialEntries, keyData } =
    Route.useLoaderData();
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Key map
  const encryptionKey = getCachedEncryptionKey();
  const [keyMap, setKeyMap] = useState<
    Map<string, { privateKey: FixedBuf<32>; keyNumber: number }>
  >(new Map());
  const [activePublicKey, setActivePublicKey] = useState<string | null>(null);

  useEffect(() => {
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
  }, [encryptionKey, keyData]);

  // Search
  function handleSearch(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await getMyEntries({
        data: { query: value || undefined },
      });
      setEntries(results);
    }, 300);
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

  // Entry list panel (shared between desktop and mobile drawer)
  function EntryList({ onSelect }: { onSelect?: () => void }) {
    return (
      <div className="flex flex-col">
        <a
          href="/vault"
          onClick={onSelect}
          className="text-muted-foreground hover:text-foreground flex items-center gap-2 px-4 py-3 text-sm no-underline transition-colors"
        >
          <Home className="h-4 w-4" />
          Vault
        </a>
        <div className="border-border/30 border-t px-3 py-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="bg-background-dark border-border text-foreground w-full rounded border py-1.5 pr-3 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="border-border/30 border-t" />
        <div className="flex-1 overflow-y-auto">
          {entries.map((e) => {
            const locked = isLocked(e.publicKey);
            const Icon = locked ? Lock : e.type === "login" ? KeyRound : FileText;
            return (
              <a
                key={e.id}
                href={`/vault/${e.id}`}
                onClick={onSelect}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm no-underline transition-colors ${
                  e.id === entryId
                    ? "bg-accent/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/5"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{e.name}</span>
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex font-sans">
      {/* Desktop entry list panel */}
      <div className="bg-background border-border/30 hidden w-64 flex-col border-r lg:flex">
        <div className="border-border/30 flex items-center gap-2 border-b px-4 py-3">
          <span className="text-foreground text-sm font-bold">Vault</span>
        </div>
        <EntryList />
      </div>

      {/* Mobile drawer backdrop */}
      <button
        type="button"
        aria-label="Close vault list"
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-300 ease-in-out lg:hidden dark:bg-black/40 ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Mobile drawer */}
      <div
        className={`bg-background border-border/30 fixed top-0 left-0 z-40 flex h-full w-64 transform flex-col border-r shadow-lg transition-transform duration-300 ease-in-out lg:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-border/30 flex items-center gap-2 border-b px-4 py-3">
          <button
            onClick={() => setDrawerOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="text-foreground text-sm font-bold">Vault</span>
        </div>
        <EntryList onSelect={() => setDrawerOpen(false)} />
      </div>

      {/* Main detail area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="bg-background border-border/30 flex items-center gap-3 border-b px-4 py-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-muted-foreground hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-foreground text-sm font-medium">
            {entry?.name ?? "Not found"}
          </span>
        </div>

        {/* Detail content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl">
            {!entry ? (
              <p className="text-muted-foreground text-sm">Entry not found.</p>
            ) : (
              <EntryDetail
                entry={entry}
                keyMap={keyMap}
                activePublicKey={activePublicKey}
                getKeyNumber={getKeyNumber}
                isLocked={isLocked}
                onDeleted={() => navigate({ to: "/vault" })}
                onUpdated={async () => {
                  const results = await getMyEntries({
                    data: { query: query || undefined },
                  });
                  setEntries(results);
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  field,
  copiedField,
  onCopy,
}: {
  label: string;
  value: string;
  field: string;
  copiedField: string | null;
  onCopy: (value: string, field: string) => void;
}) {
  return (
    <div className="border-border/30 flex items-center gap-3 rounded border px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-foreground mt-0.5 break-all text-sm">{value}</p>
      </div>
      <button
        onClick={() => onCopy(value, field)}
        className="text-muted-foreground hover:text-foreground shrink-0"
        title="Copy"
      >
        {copiedField === field ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

function EntryDetail({
  entry,
  keyMap,
  activePublicKey,
  getKeyNumber,
  isLocked,
  onDeleted,
  onUpdated,
}: {
  entry: {
    id: string;
    name: string;
    type: string;
    searchTerms: string;
    publicKey: string;
    encryptedData: string;
    createdAt: Date;
    updatedAt: Date;
  };
  keyMap: Map<string, { privateKey: FixedBuf<32>; keyNumber: number }>;
  activePublicKey: string | null;
  getKeyNumber: (pk: string) => number | null;
  isLocked: (pk: string) => boolean;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Edit state
  const [editName, setEditName] = useState(entry.name);
  const [editSearchTerms, setEditSearchTerms] = useState(entry.searchTerms);
  const [editDomain, setEditDomain] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editText, setEditText] = useState("");

  // Visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showText, setShowText] = useState(false);

  // Copy state
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const locked = isLocked(entry.publicKey);
  const keyNum = getKeyNumber(entry.publicKey);
  const keyInfo = keyMap.get(entry.publicKey);

  // Decrypt
  const decrypted = keyInfo
    ? tryDecryptVaultEntry(entry.encryptedData, keyInfo.privateKey)
    : null;

  function startEditing() {
    if (!decrypted || !decrypted.ok) return;
    setEditName(entry.name);
    setEditSearchTerms(entry.searchTerms);
    if (decrypted.data.type === "login") {
      setEditDomain(decrypted.data.domain ?? "");
      setEditUsername(decrypted.data.username ?? "");
      setEditEmail(decrypted.data.email ?? "");
      setEditPassword(decrypted.data.password ?? "");
      setEditNotes(decrypted.data.notes ?? "");
    } else {
      setEditText(decrypted.data.text);
    }
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!keyInfo || !decrypted?.ok) return;
    setError("");
    setSaving(true);

    try {
      let data: VaultEntryData;
      if (decrypted.data.type === "login") {
        data = {
          type: "login",
          ...(editDomain && { domain: editDomain }),
          ...(editUsername && { username: editUsername }),
          ...(editEmail && { email: editEmail }),
          ...(editPassword && { password: editPassword }),
          ...(editNotes && { notes: editNotes }),
        };
      } else {
        data = { type: "text", text: editText };
      }

      const encryptedData = encryptVaultEntry(data, keyInfo.privateKey);
      await updateEntry({
        data: {
          id: entry.id,
          name: editName,
          type: entry.type,
          searchTerms: editSearchTerms,
          publicKey: entry.publicKey,
          encryptedData,
        },
      });
      setEditing(false);
      onUpdated();
      // Reload the page to get fresh data
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteEntry({ data: entry.id });
      onDeleted();
    } catch {
      setError("Failed to delete.");
    }
  }

  function copyToClipboard(value: string, field: string) {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function CopyButton({ value, field }: { value: string; field: string }) {
    return (
      <button
        onClick={() => copyToClipboard(value, field)}
        className="text-muted-foreground hover:text-foreground shrink-0"
        title="Copy"
      >
        {copiedField === field ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    );
  }

  if (locked) {
    return (
      <div className="flex flex-col items-center pt-16">
        <Lock className="text-muted-foreground h-16 w-16" />
        <p className="text-muted-foreground mt-4 text-sm">
          This entry is encrypted with a locked key
          {keyNum !== null && ` (Key #${keyNum})`}.
        </p>
        <a
          href="/keys"
          className="text-accent hover:text-accent/80 mt-2 text-sm no-underline"
        >
          Unlock on Keys page
        </a>
      </div>
    );
  }

  if (!decrypted) {
    return (
      <p className="text-muted-foreground text-sm">Loading keys...</p>
    );
  }

  if (!decrypted.ok) {
    return (
      <div>
        <p className="text-muted-foreground text-sm">
          Unable to display entry data.
        </p>
        {decrypted.raw && (
          <details className="mt-4">
            <summary className="text-muted-foreground cursor-pointer text-xs">
              Show raw data
            </summary>
            <pre className="bg-background-dark text-foreground mt-2 overflow-x-auto rounded p-3 text-xs">
              {decrypted.raw}
            </pre>
          </details>
        )}
      </div>
    );
  }

  const { data } = decrypted;

  if (editing) {
    return (
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-lg font-bold">Edit Entry</h2>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Label section */}
        <div>
          <h3 className="text-foreground text-sm font-medium">Label</h3>
          <p className="text-muted-foreground mb-2 text-xs">
            Searchable. Visible to the server.
          </p>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="bg-background-dark border-border text-foreground rounded border px-4 py-2 text-sm"
              required
            />
            <input
              type="text"
              placeholder="Search terms"
              value={editSearchTerms}
              onChange={(e) => setEditSearchTerms(e.target.value)}
              className="bg-background-dark border-border text-foreground rounded border px-4 py-2 text-sm"
            />
          </div>
        </div>

        {/* Secret section */}
        <div>
          <h3 className="text-foreground text-sm font-medium">Secret</h3>
          <p className="text-muted-foreground mb-2 text-xs">
            Encrypted. Only you can see this.
          </p>
        </div>

        {data.type === "login" ? (
          <>
            <div>
              <input
                type="text"
                placeholder="Domain"
                value={editDomain}
                onChange={(e) => setEditDomain(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              />
              {editDomain && (() => {
                const { hint, domain: suggested } = parseDomainInput(editDomain);
                if (!hint) return null;
                return (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {suggested && suggested !== editDomain.trim() ? (
                      <>
                        {hint}{" "}
                        <button
                          type="button"
                          onClick={() => setEditDomain(suggested)}
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
            <input
              type="text"
              placeholder="Username"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              className="bg-background-dark border-border text-foreground rounded border px-4 py-2 text-sm"
            />
            <div>
              <input
                type="text"
                placeholder="Email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              />
              {editEmail && validateEmail(editEmail) && (
                <p className="mt-1 text-xs text-yellow-500">
                  {validateEmail(editEmail)}
                </p>
              )}
            </div>
            <div>
              <input
                type="text"
                placeholder="Password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              />
              {editPassword && (
                <div className="mt-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    {editPassword.length} characters
                  </span>
                  <span
                    className={entropyColor(
                      entropyTier(calculatePasswordEntropy(editPassword)),
                    )}
                  >
                    {calculatePasswordEntropy(editPassword).toFixed(1)} bits —{" "}
                    {entropyLabel(
                      entropyTier(calculatePasswordEntropy(editPassword)),
                    )}
                  </span>
                </div>
              )}
            </div>
            <textarea
              placeholder="Notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="bg-background-dark border-border text-foreground rounded border px-4 py-2 text-sm"
              rows={3}
            />
          </>
        ) : (
          <textarea
            placeholder="Secret text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="bg-background-dark border-border text-foreground rounded border px-4 py-2 text-sm"
            rows={5}
            required
          />
        )}
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-4 py-2 text-sm transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // View mode
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-foreground text-xl font-bold">{entry.name}</h2>
          {entry.searchTerms && (
            <p className="text-muted-foreground mt-1 text-xs">
              {entry.searchTerms}
            </p>
          )}
          <div className="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
            {keyNum !== null && <span>Key #{keyNum}</span>}
            {activePublicKey &&
              entry.publicKey !== activePublicKey && (
                <span className="text-yellow-500">older key</span>
              )}
            <span>
              Updated {new Date(entry.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startEditing}
            className="text-muted-foreground hover:text-foreground"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {deleting ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                className="text-destructive text-xs font-medium"
              >
                Confirm
              </button>
              <button
                onClick={() => setDeleting(false)}
                className="text-muted-foreground text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDeleting(true)}
              className="text-muted-foreground hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      {/* Fields */}
      {data.type === "login" ? (
        <div className="flex flex-col gap-3">
          {data.domain && (
            <FieldRow label="Domain" value={data.domain} field="domain" copiedField={copiedField} onCopy={copyToClipboard} />
          )}
          {data.username && (
            <FieldRow
              label="Username"
              value={data.username}
              field="username"
              copiedField={copiedField}
              onCopy={copyToClipboard}
            />
          )}
          {data.email && (
            <FieldRow label="Email" value={data.email} field="email" copiedField={copiedField} onCopy={copyToClipboard} />
          )}
          {data.password && (
            <div className="border-border/30 flex items-center gap-3 rounded border px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs">Password</p>
                <p className="text-foreground mt-0.5 break-all text-sm">
                  {showPassword ? data.password : "••••••••••••"}
                </p>
              </div>
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
              <CopyButton value={data.password} field="password" />
            </div>
          )}
          {data.notes && (
            <div className="border-border/30 rounded border px-4 py-3">
              <p className="text-muted-foreground text-xs">Notes</p>
              <p className="text-foreground mt-0.5 whitespace-pre-wrap text-sm">
                {data.notes}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="border-border/30 flex items-center gap-3 rounded border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">Secret Text</p>
            <p className="text-foreground mt-0.5 break-all text-sm">
              {showText ? data.text : "••••••••••••••••••••"}
            </p>
          </div>
          <button
            onClick={() => setShowText(!showText)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            {showText ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
          <CopyButton value={data.text} field="text" />
        </div>
      )}
    </div>
  );

}
