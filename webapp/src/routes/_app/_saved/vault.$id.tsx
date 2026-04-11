import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  getMyEntries,
  getEntry,
  updateEntry,
  deleteEntry,
  deleteSecretFn,
  getHistory,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { encryptSecretMessage } from "~/lib/message";
import {
  sendMessage,
  getPublicKeyForAddress,
  getRemotePowChallenge,
  getMyActiveEncryptedKey,
} from "~/server/message.functions";
import { getMyUser } from "~/server/user.functions";
import { signPowRequest } from "~/lib/auth";
import { PowModal } from "~/components/PowModal";
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
  Send as SendIcon,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  RotateCcw,
  History,
} from "lucide-react";
import type { PowChallenge, PowSolution } from "~/lib/use-pow-miner";

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
    const history = entry
      ? await getHistory({ data: entry.secretId })
      : [];
    return { entryId: params.id, entry, entries, keyData, history };
  },
  component: VaultDetailPage,
});

function VaultDetailPage() {
  const navigate = useNavigate();
  const { entryId, entry, entries: initialEntries, keyData, history } =
    Route.useLoaderData();
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Sync loader data into state on navigation
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  // Key map
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

  // EntryList is rendered inline (not as a nested component) to avoid
  // unmount/remount on parent re-render, which would lose search input focus.
  function renderEntryList(onSelect?: () => void) {
    return (
      <div className="flex flex-col">
        <Link
          to="/home"
          onClick={onSelect}
          className="text-muted-foreground hover:text-foreground flex items-center gap-2 px-4 py-3 text-sm no-underline transition-colors"
        >
          <Home className="h-4 w-4" />
          Home
        </Link>
        <Link
          to="/vault"
          onClick={onSelect}
          className="text-muted-foreground hover:text-foreground flex items-center gap-2 px-4 py-3 text-sm no-underline transition-colors"
        >
          <Lock className="h-4 w-4" />
          Vault
        </Link>
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
              <Link
                key={e.id}
                to="/vault/$id"
                params={{ id: e.id }}
                onClick={onSelect}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm no-underline transition-colors ${
                  e.id === entryId
                    ? "bg-accent/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/5"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{e.name}</span>
              </Link>
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
        {renderEntryList()}
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
        {renderEntryList(() => setDrawerOpen(false))}
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
          <Link
            to="/vault"
            className="text-foreground flex items-center gap-1 text-sm font-medium no-underline"
          >
            <ChevronLeft className="h-4 w-4" />
            Vault
          </Link>
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
                onSaved={(id: string) =>
                  navigate({ to: "/vault/$id", params: { id } })
                }
                history={history}
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
  onSaved,
  history,
}: {
  entry: {
    id: string;
    name: string;
    type: string;
    searchTerms: string;
    publicKey: string;
    encryptedData: string;
    sourceMessageId: string | null;
    sourceAddress: string | null;
    createdAt: Date;
    secretId: string;
    version: number;
  };
  keyMap: Map<string, { privateKey: FixedBuf<32>; keyNumber: number }>;
  activePublicKey: string | null;
  getKeyNumber: (pk: string) => number | null;
  isLocked: (pk: string) => boolean;
  onDeleted: () => void;
  onSaved: (id: string) => void;
  history: Array<{
    id: string;
    version: number;
    name: string;
    type: string;
    searchTerms: string;
    publicKey: string;
    encryptedData: string;
    createdAt: Date;
  }>;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);

  // Filter out current version from history
  const olderVersions = history.filter((v) => v.id !== entry.id);
  const [sharing, setSharing] = useState(false);
  const [shareAddress, setShareAddress] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [powChallenge, setPowChallenge] = useState<PowChallenge | null>(null);
  const pendingShareRef = useRef<{
    recipientAddress: string;
    encryptedContent: string;
    senderPubKey: string;
    recipientPubKey: string;
  } | null>(null);

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
      const result = await updateEntry({
        data: {
          secretId: entry.secretId,
          name: editName,
          type: entry.type,
          searchTerms: editSearchTerms,
          publicKey: entry.publicKey,
          encryptedData,
        },
      });
      setEditing(false);
      onSaved(result.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteSecretFn({ data: entry.secretId });
      onDeleted();
    } catch {
      setError("Failed to delete.");
    }
  }

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    if (!decrypted?.ok || !keyInfo) return;
    setError("");
    setShareStatus("Looking up recipient...");
    try {
      const recipientKey = await getPublicKeyForAddress({
        data: shareAddress,
      });
      if (!recipientKey) throw new Error("Recipient not found");

      setShareStatus("Encrypting...");
      const secret = {
        name: entry.name,
        secretType: entry.type,
        fields:
          decrypted.data.type === "login"
            ? Object.fromEntries(
                Object.entries(decrypted.data).filter(
                  ([k]) => k !== "type",
                ),
              )
            : { text: decrypted.data.text },
      };
      // Get my active key for ECDH encryption
      const myActiveKey = await getMyActiveEncryptedKey();
      const encKey = getCachedEncryptionKey();
      if (!encKey) throw new Error("Encryption key not found");
      const myPrivKey = decryptPrivateKey(
        myActiveKey.encryptedPrivateKey,
        encKey,
      );

      const theirPubKey = FixedBuf.fromHex(33, recipientKey.publicKey);
      const encryptedContent = encryptSecretMessage(
        secret,
        myPrivKey,
        theirPubKey,
      );

      pendingShareRef.current = {
        recipientAddress: shareAddress,
        encryptedContent,
        senderPubKey: myActiveKey.publicKey,
        recipientPubKey: recipientKey.publicKey,
      };

      // Get PoW challenge
      setShareStatus("Requesting proof of work...");
      const me = await getMyUser();
      if (!me?.name || !me.domain) throw new Error("Account not saved");
      const senderAddress = `${me.name}@${me.domain}`;
      const { signature, timestamp } = signPowRequest(
        senderAddress,
        shareAddress,
        myPrivKey,
      );
      const challenge = await getRemotePowChallenge({
        data: {
          recipientAddress: shareAddress,
          senderAddress,
          senderPubKey: myActiveKey.publicKey,
          signature,
          timestamp,
        },
      });
      setShareStatus("");
      setPowChallenge(challenge);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to share.");
      setShareStatus("");
    }
  }

  async function handleSharePowComplete(solution: PowSolution) {
    setPowChallenge(null);
    const pending = pendingShareRef.current;
    if (!pending) return;
    try {
      await sendMessage({ data: { ...pending, pow: solution } });
      setSharing(false);
      setShareAddress("");
      pendingShareRef.current = null;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send.");
    }
  }

  function handleSharePowCancel() {
    setPowChallenge(null);
    pendingShareRef.current = null;
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
        <Link
          to="/keys"
          className="text-accent hover:text-accent/80 mt-2 text-sm no-underline"
        >
          Unlock on Keys page
        </Link>
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
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
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
                value={editSearchTerms}
                onChange={(e) => setEditSearchTerms(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              />
            </div>
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
              <label className="text-muted-foreground mb-1 block text-xs">
                Domain
              </label>
              <input
                type="text"
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
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Username
              </label>
              <input
                type="text"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Email
              </label>
              <input
                type="text"
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
              <label className="text-muted-foreground mb-1 block text-xs">
                Password
              </label>
              <input
                type="text"
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
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Notes
              </label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
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
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="bg-background-dark border-border text-foreground w-full rounded border px-4 py-2 text-sm"
              rows={5}
              required
            />
          </div>
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
              v{entry.version} — {new Date(entry.createdAt).toLocaleDateString()}
            </span>
          </div>
          {entry.sourceAddress && (
            <p className="text-muted-foreground mt-1 text-xs">
              Received from{" "}
              <Link
                to="/channel/$address"
                params={{ address: entry.sourceAddress }}
                className="text-accent hover:text-accent/80 no-underline"
              >
                {entry.sourceAddress}
              </Link>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {deleting ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Delete?</span>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground cursor-pointer">
                  <EllipsisVertical className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setSharing(!sharing)}
                  className="cursor-pointer"
                >
                  <SendIcon className="mr-2 h-4 w-4" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={startEditing}
                  className="cursor-pointer"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleting(true)}
                  className="text-destructive cursor-pointer"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Share form */}
      {sharing && (
        <form
          onSubmit={handleShare}
          className="border-border/30 rounded border p-3"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Recipient address (e.g. name@domain)"
              value={shareAddress}
              onChange={(e) => setShareAddress(e.target.value)}
              className="bg-background-dark border-border text-foreground flex-1 rounded border px-3 py-1.5 text-sm"
              required
              autoFocus
            />
            <button
              type="submit"
              className="bg-accent text-accent-foreground hover:bg-accent/90 rounded px-3 py-1.5 text-sm transition-all"
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => {
                setSharing(false);
                setShareAddress("");
                setShareStatus("");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {shareStatus && (
            <p className="text-muted-foreground mt-2 text-xs">{shareStatus}</p>
          )}
        </form>
      )}

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

      {/* History */}
      {olderVersions.length > 0 && (
        <div className="border-border/30 mt-6 rounded border">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-4 py-3 text-sm transition-colors"
          >
            <History className="h-4 w-4" />
            History ({olderVersions.length}{" "}
            {olderVersions.length === 1 ? "version" : "versions"})
            {historyOpen ? (
              <ChevronUp className="ml-auto h-4 w-4" />
            ) : (
              <ChevronDown className="ml-auto h-4 w-4" />
            )}
          </button>
          {historyOpen && (
            <div className="border-border/30 border-t">
              {olderVersions.map((ver) => {
                const verKeyInfo = keyMap.get(ver.publicKey);
                const verDecrypted = verKeyInfo
                  ? tryDecryptVaultEntry(ver.encryptedData, verKeyInfo.privateKey)
                  : null;
                const isExpanded = expandedVersion === ver.version;

                return (
                  <div
                    key={ver.id}
                    className="border-border/30 border-b last:border-b-0"
                  >
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <button
                        onClick={() =>
                          setExpandedVersion(isExpanded ? null : ver.version)
                        }
                        className="text-muted-foreground hover:text-foreground flex flex-1 items-center gap-2 text-sm transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        v{ver.version} —{" "}
                        {new Date(ver.createdAt).toLocaleString()}
                      </button>
                      <button
                        onClick={async () => {
                          if (!verDecrypted?.ok || !keyInfo) return;
                          const encryptedData = encryptVaultEntry(
                            verDecrypted.data,
                            keyInfo.privateKey,
                          );
                          const result = await updateEntry({
                            data: {
                              secretId: entry.secretId,
                              name: ver.name,
                              type: ver.type,
                              searchTerms: ver.searchTerms,
                              publicKey: entry.publicKey,
                              encryptedData,
                            },
                          });
                          onSaved(result.id);
                        }}
                        className="text-accent hover:text-accent/80 text-xs"
                        title="Restore this version"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          await deleteEntry({ data: ver.id });
                          onSaved(entry.id);
                        }}
                        className="text-muted-foreground hover:text-destructive text-xs"
                        title="Delete this version"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {isExpanded && verDecrypted?.ok && (
                      <div className="border-border/30 border-t px-4 py-3">
                        <div className="flex flex-col gap-2">
                          {verDecrypted.data.type === "login" ? (
                            <>
                              {verDecrypted.data.domain && (
                                <p className="text-sm">
                                  <span className="text-muted-foreground text-xs">
                                    Domain:{" "}
                                  </span>
                                  {verDecrypted.data.domain}
                                </p>
                              )}
                              {verDecrypted.data.username && (
                                <p className="text-sm">
                                  <span className="text-muted-foreground text-xs">
                                    Username:{" "}
                                  </span>
                                  {verDecrypted.data.username}
                                </p>
                              )}
                              {verDecrypted.data.email && (
                                <p className="text-sm">
                                  <span className="text-muted-foreground text-xs">
                                    Email:{" "}
                                  </span>
                                  {verDecrypted.data.email}
                                </p>
                              )}
                              {verDecrypted.data.password && (
                                <p className="text-sm">
                                  <span className="text-muted-foreground text-xs">
                                    Password:{" "}
                                  </span>
                                  ••••••••
                                </p>
                              )}
                              {verDecrypted.data.notes && (
                                <p className="text-sm">
                                  <span className="text-muted-foreground text-xs">
                                    Notes:{" "}
                                  </span>
                                  {verDecrypted.data.notes}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm">
                              <span className="text-muted-foreground text-xs">
                                Text:{" "}
                              </span>
                              ••••••••
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {isExpanded && !verDecrypted?.ok && (
                      <div className="border-border/30 border-t px-4 py-3">
                        <p className="text-muted-foreground text-xs italic">
                          Cannot decrypt — key may be locked
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <PowModal
        challenge={powChallenge}
        onComplete={handleSharePowComplete}
        onCancel={handleSharePowCancel}
      />
    </div>
  );

}
