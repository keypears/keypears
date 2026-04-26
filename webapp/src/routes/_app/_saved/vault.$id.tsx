import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
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
  decryptSigningKey,
  decryptEd25519Key,
  decryptX25519Key,
  calculatePasswordEntropy,
  entropyTier,
  entropyLabel,
  entropyColor,
} from "~/lib/auth";
import { parseDomainInput, validateEmail } from "~/lib/vault-validation";
import {
  tryDecryptVaultEntry,
  encryptVaultEntry,
  type DecryptResult,
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
import { WebBuf } from "@webbuf/webbuf";
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
  loader: async ({ params }) => {
    const [entry, entries, keyData] = await Promise.all([
      getEntry({ data: params.id }),
      getMyEntries(),
      getMyKeys(),
    ]);
    const history = entry ? await getHistory({ data: entry.id }) : [];
    return { entryId: params.id, entry, entries, keyData, history };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.entry
          ? `${loaderData.entry.name} — Vault — KeyPears`
          : "Vault — KeyPears",
      },
    ],
  }),
  component: VaultDetailPage,
});

function VaultDetailPage() {
  const navigate = useNavigate();
  const {
    entryId,
    entry,
    entries: initialEntries,
    keyData,
    history,
  } = Route.useLoaderData();
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Sync loader data into state on navigation
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  // Key map — tracks which keyIds are unlockable with the current password.
  // Vault encryption uses the cached encryptionKey directly (same for all keys
  // under the same password), so we don't need to store decrypted keys here.
  const [keyMap, setKeyMap] = useState<
    Map<string, { keyNumber: number }>
  >(new Map());
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);

  useEffect(() => {
    const map = new Map<string, { keyNumber: number }>();
    for (const k of keyData.keys) {
      if (k.loginKeyHash === keyData.passwordHash) {
        map.set(k.id, { keyNumber: k.keyNumber });
      }
    }
    setKeyMap(map);
    if (keyData.keys.length > 0) {
      setActiveKeyId(keyData.keys[0].id);
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

  function getKeyNumber(keyId: string): number | null {
    const k = keyMap.get(keyId);
    if (k) return k.keyNumber;
    const match = keyData.keys.find((key) => key.id === keyId);
    return match?.keyNumber ?? null;
  }

  function isLocked(keyId: string): boolean {
    return !keyMap.has(keyId);
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
            const locked = isLocked(e.keyId);
            const Icon = locked
              ? Lock
              : e.type === "login"
                ? KeyRound
                : FileText;
            return (
              <Link
                key={e.id}
                to="/vault/$id"
                params={{ id: e.versionId }}
                onClick={onSelect}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm no-underline transition-colors ${
                  e.versionId === entryId
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
                activeKeyId={activeKeyId}
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
        <p className="text-foreground mt-0.5 text-sm break-all">{value}</p>
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
  activeKeyId,
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
    keyId: string;
    encryptedData: string;
    sourceMessageId: string | null;
    sourceAddress: string | null;
    latestVersionId: string | null;
    createdAt: Date;
    updatedAt: Date;
    versionId: string;
    version: number;
    versionCreatedAt: Date;
  };
  keyMap: Map<string, { keyNumber: number }>;
  activeKeyId: string | null;
  getKeyNumber: (keyId: string) => number | null;
  isLocked: (keyId: string) => boolean;
  onDeleted: () => void;
  onSaved: (id: string) => void;
  // `secret_versions` rows only carry the versioned encrypted payload
  // plus identifying metadata. `name`, `type`, and `searchTerms` live on
  // the parent `secrets` row and are NOT versioned — restoring an older
  // version keeps the current metadata and only rolls the encrypted
  // payload back, which is why those fields aren't on this type.
  history: Array<{
    id: string;
    version: number;
    keyId: string;
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

  // Filter out current version from history (memoized so its array
  // reference is stable across renders — critical because this is a
  // dependency of the pre-decryption effect below).
  const olderVersions = useMemo(
    () => history.filter((v) => v.id !== entry.versionId),
    [history, entry.versionId],
  );
  const [sharing, setSharing] = useState(false);
  const [shareAddress, setShareAddress] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [powChallenge, setPowChallenge] = useState<PowChallenge | null>(null);
  const pendingShareRef = useRef<{
    recipientAddress: string;
    encryptedContent: string;
    senderEncryptedContent: string;
    senderSignature: string;
    senderPubKey: string;
    recipientPubKey: string;
    senderEd25519PubKey: string;
    senderX25519PubKey: string;
    recipientX25519PubKey: string;
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

  const locked = isLocked(entry.keyId);
  const keyNum = getKeyNumber(entry.keyId);
  const isUnlockable = keyMap.has(entry.keyId);

  // Pre-decrypt in an effect so render stays synchronous
  const [decrypted, setDecrypted] = useState<DecryptResult | null>(null);
  const [versionsDecrypted, setVersionsDecrypted] = useState<
    Map<string, DecryptResult>
  >(new Map());

  useEffect(() => {
    const encryptionKey = getCachedEncryptionKey();
    if (!isUnlockable || !encryptionKey) {
      setDecrypted(null);
      setVersionsDecrypted(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await tryDecryptVaultEntry(
        WebBuf.fromHex(entry.encryptedData as string),
        encryptionKey,
      );
      if (cancelled) return;
      setDecrypted(result);

      // Decrypt all older versions in the same effect so the history
      // panel can render them synchronously from state.
      const vmap = new Map<string, DecryptResult>();
      for (const ver of olderVersions) {
        if (!keyMap.has(ver.keyId)) continue;
        const verResult = await tryDecryptVaultEntry(
          WebBuf.fromHex(ver.encryptedData as string),
          encryptionKey,
        );
        if (cancelled) return;
        vmap.set(ver.id, verResult);
      }
      if (!cancelled) setVersionsDecrypted(vmap);
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.encryptedData, isUnlockable, olderVersions, keyMap]);

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
    const encryptionKey = getCachedEncryptionKey();
    if (!isUnlockable || !encryptionKey || !decrypted?.ok) return;
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

      const encryptedDataBuf = await encryptVaultEntry(data, encryptionKey);
      const result = await updateEntry({
        data: {
          secretId: entry.id,
          name: editName,
          type: entry.type,
          searchTerms: editSearchTerms,
          keyId: entry.keyId,
          encryptedData: encryptedDataBuf.toHex(),
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
      await deleteSecretFn({ data: entry.id });
      onDeleted();
    } catch {
      setError("Failed to delete.");
    }
  }

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    if (!decrypted?.ok || !isUnlockable) return;
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
                Object.entries(decrypted.data).filter(([k]) => k !== "type"),
              )
            : { text: decrypted.data.text },
      };
      // Get my active key for encryption
      const myActiveKey = await getMyActiveEncryptedKey();
      const encKey = getCachedEncryptionKey();
      if (!encKey) throw new Error("Encryption key not found");
      const myEd25519Key = await decryptEd25519Key(
        WebBuf.fromHex(myActiveKey.encryptedEd25519Key as string),
        encKey,
      );
      const myX25519Key = await decryptX25519Key(
        WebBuf.fromHex(myActiveKey.encryptedX25519Key as string),
        encKey,
      );
      const mySigningKey = await decryptSigningKey(
        WebBuf.fromHex(myActiveKey.encryptedSigningKey as string),
        encKey,
      );

      const me = await getMyUser();
      if (!me?.name || !me.domain) throw new Error("Account not saved");
      const senderAddress = `${me.name}@${me.domain}`;

      const senderEncapPubKey = FixedBuf.fromHex(1184, myActiveKey.encapPublicKey as string);
      const recipientEncapPubKey = FixedBuf.fromHex(1184, recipientKey.encapPublicKey as string);
      const { recipientCiphertext, senderCiphertext, signature: msgSignature } = encryptSecretMessage(
        secret,
        senderAddress,
        shareAddress,
        myEd25519Key,
        WebBuf.fromHex(myActiveKey.ed25519PublicKey as string),
        mySigningKey,
        WebBuf.fromHex(myActiveKey.signingPublicKey as string),
        myX25519Key,
        WebBuf.fromHex(myActiveKey.x25519PublicKey as string),
        senderEncapPubKey,
        WebBuf.fromHex(recipientKey.x25519PublicKey as string),
        recipientEncapPubKey,
        WebBuf.fromHex(recipientKey.encapPublicKey as string),
      );

      pendingShareRef.current = {
        recipientAddress: shareAddress,
        encryptedContent: recipientCiphertext.toHex(),
        senderEncryptedContent: senderCiphertext.toHex(),
        senderSignature: msgSignature.toHex(),
        senderPubKey: myActiveKey.signingPublicKey as string,
        recipientPubKey: recipientKey.encapPublicKey as string,
        senderEd25519PubKey: myActiveKey.ed25519PublicKey as string,
        senderX25519PubKey: myActiveKey.x25519PublicKey as string,
        recipientX25519PubKey: recipientKey.x25519PublicKey as string,
      };

      // Get PoW challenge
      setShareStatus("Requesting proof of work...");
      const { signature, timestamp } = signPowRequest(
        senderAddress,
        shareAddress,
        myEd25519Key,
        mySigningKey,
      );
      const challenge = await getRemotePowChallenge({
        data: {
          recipientAddress: shareAddress,
          senderAddress,
          senderEd25519PubKey: myActiveKey.ed25519PublicKey as string,
          senderPubKey: myActiveKey.signingPublicKey as string,
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
    return <p className="text-muted-foreground text-sm">Loading keys...</p>;
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
              {editDomain &&
                (() => {
                  const { hint, domain: suggested } =
                    parseDomainInput(editDomain);
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
            {activeKeyId && entry.keyId !== activeKeyId && (
              <span className="text-yellow-500">older key</span>
            )}
            <span>
              v{entry.version} —{" "}
              {new Date(entry.versionCreatedAt).toLocaleDateString()}
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
            <FieldRow
              label="Domain"
              value={data.domain}
              field="domain"
              copiedField={copiedField}
              onCopy={copyToClipboard}
            />
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
            <FieldRow
              label="Email"
              value={data.email}
              field="email"
              copiedField={copiedField}
              onCopy={copyToClipboard}
            />
          )}
          {data.password && (
            <div className="border-border/30 flex items-center gap-3 rounded border px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs">Password</p>
                <p className="text-foreground mt-0.5 text-sm break-all">
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
              <p className="text-foreground mt-0.5 text-sm whitespace-pre-wrap">
                {data.notes}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="border-border/30 flex items-center gap-3 rounded border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">Secret Text</p>
            <p className="text-foreground mt-0.5 text-sm break-all">
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
                const verDecrypted = versionsDecrypted.get(ver.id) ?? null;
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-muted-foreground hover:text-foreground cursor-pointer">
                            <EllipsisVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={async () => {
                              const encKey = getCachedEncryptionKey();
                              if (!verDecrypted?.ok || !isUnlockable || !encKey) return;
                              const encryptedDataBuf = await encryptVaultEntry(
                                verDecrypted.data,
                                encKey,
                              );
                              const result = await updateEntry({
                                data: {
                                  secretId: entry.id,
                                  // name/type/searchTerms aren't versioned
                                  // in secret_versions, so we keep the
                                  // current entry's metadata and only roll
                                  // the encrypted payload back.
                                  name: entry.name,
                                  type: entry.type,
                                  searchTerms: entry.searchTerms,
                                  keyId: entry.keyId,
                                  encryptedData: encryptedDataBuf.toHex(),
                                },
                              });
                              onSaved(result.id);
                            }}
                            className="cursor-pointer"
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Restore
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={async () => {
                              await deleteEntry({ data: ver.id });
                              onSaved(entry.versionId);
                            }}
                            className="text-destructive cursor-pointer"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
