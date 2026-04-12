import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  claimDomainFn,
  getMyDomains,
  getMyUser,
  getDomainUsersFn,
  createDomainUserFn,
  resetDomainUserPasswordFn,
  adminCheckNameAvailable,
  toggleOpenRegistrationFn,
  toggleAllowThirdPartyDomainsFn,
} from "~/server/user.functions";
import { getServerApiDomain } from "~/server/config.functions";
import {
  derivePasswordKey,
  deriveLoginKeyFromPasswordKey,
  deriveEncryptionKeyFromPasswordKey,
  generateAndEncryptKeyPairFromEncryptionKey,
  calculatePasswordEntropy,
  entropyTier,
  entropyLabel,
  entropyColor,
} from "~/lib/auth";
import { parseAddress } from "~/lib/config";
import { nameSchema } from "~/server/schemas";
import {
  Globe,
  Plus,
  RotateCw,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Loader2,
  Copy,
} from "lucide-react";

export const Route = createFileRoute("/_app/_saved/_chrome/domains")({
  head: () => ({ meta: [{ title: "Domains — KeyPears" }] }),
  loader: async () => {
    const [domains, user, apiDomain] = await Promise.all([
      getMyDomains(),
      getMyUser(),
      getServerApiDomain(),
    ]);
    return { domains, user, apiDomain };
  },
  component: DomainsPage,
});

function DomainsPage() {
  const data = Route.useLoaderData();
  const [domainList, setDomainList] = useState(data.domains);

  // Sync loader data into state on navigation
  useEffect(() => {
    setDomainList(data.domains);
  }, [data.domains]);

  // The user's full address — pre-fills the `admin` field of the
  // generated keypears.json. Both fields are guaranteed to be set
  // because this route lives under _saved.
  const myAddress =
    data.user?.name && data.user?.domain
      ? `${data.user.name}@${data.user.domain}`
      : "";

  // Generator state. `domainInput` doubles as the value passed to
  // claimDomainFn — there's only one source of truth for the domain.
  const [domainInput, setDomainInput] = useState("");
  const [apiDomainInput, setApiDomainInput] = useState(data.apiDomain);
  const [adminInput, setAdminInput] = useState(myAddress);
  const [claimError, setClaimError] = useState("");
  const [claimStatus, setClaimStatus] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);

  const trimmedApiDomain = apiDomainInput.trim();
  const trimmedAdmin = adminInput.trim();
  const trimmedDomain = domainInput.trim();

  // Live JSON, used both for the highlighted preview and the clipboard
  // copy. The protocol spec treats `admin` as optional, but THIS server's
  // claim verification requires it (federation.server.ts:verifyDomainAdmin
  // rejects a keypears.json with no `admin` field, or one whose value
  // doesn't match the calling user's address). So in this form admin is
  // mandatory — we still omit the line from the preview while the field
  // is empty so the user can see it shrink, but the input is `required`
  // and the form can't submit without it.
  const jsonString = useMemo(() => {
    const obj: Record<string, string> = { apiDomain: trimmedApiDomain };
    if (trimmedAdmin) obj.admin = trimmedAdmin;
    return JSON.stringify(obj, null, 2);
  }, [trimmedApiDomain, trimmedAdmin]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some browsers / contexts disallow clipboard writes; fail silently.
    }
  }

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    setClaimError("");
    setClaimStatus("");
    setClaiming(true);
    try {
      setClaimStatus("Verifying keypears.json...");
      await claimDomainFn({ data: trimmedDomain });
      const updated = await getMyDomains();
      setDomainList(updated);
      setDomainInput("");
      setClaimStatus("");
    } catch (err: unknown) {
      setClaimError(
        err instanceof Error ? err.message : "Failed to claim domain.",
      );
      setClaimStatus("");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-foreground text-2xl font-bold">Domains</h1>

      {/* Claim a domain */}
      <section className="mt-8">
        <h2 className="text-foreground text-lg font-semibold">
          Claim a Domain
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          To claim a domain, host a{" "}
          <code className="text-foreground">keypears.json</code> file at{" "}
          <code className="text-foreground">/.well-known/keypears.json</code>{" "}
          on the domain you control, then click Claim.
        </p>

        <form onSubmit={handleClaim} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-muted-foreground text-xs">
              Domain
              <input
                type="text"
                placeholder="e.g. lockberries.test"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                className="bg-background-dark border-border text-foreground mt-1 w-full rounded border px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-muted-foreground text-xs">
              API domain
              <input
                type="text"
                placeholder={data.apiDomain}
                value={apiDomainInput}
                onChange={(e) => setApiDomainInput(e.target.value)}
                className="bg-background-dark border-border text-foreground mt-1 w-full rounded border px-3 py-2 text-sm"
                required
              />
              <span className="text-muted-foreground mt-1 block text-[11px]">
                Must match this server&apos;s API domain for the claim to
                verify.
              </span>
            </label>
            <label className="text-muted-foreground text-xs">
              Admin
              <input
                type="text"
                placeholder={myAddress || `you@${data.apiDomain}`}
                value={adminInput}
                onChange={(e) => setAdminInput(e.target.value)}
                className="bg-background-dark border-border text-foreground mt-1 w-full rounded border px-3 py-2 text-sm"
                required
              />
              <span className="text-muted-foreground mt-1 block text-[11px]">
                Must be your own KeyPears address. This server verifies that
                the <code className="text-foreground">admin</code> field
                matches the user claiming the domain.
              </span>
            </label>
          </div>

          <div className="mt-2">
            <p className="text-muted-foreground text-xs">
              Place this at{" "}
              <code className="text-foreground">
                https://{trimmedDomain || "<your-domain>"}/.well-known/keypears.json
              </code>
            </p>
            <div className="relative mt-2">
              <HighlightedJson
                apiDomain={trimmedApiDomain}
                admin={trimmedAdmin}
              />
              <button
                type="button"
                onClick={handleCopy}
                className="bg-background border-border text-muted-foreground hover:text-foreground absolute top-2 right-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition-all"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-green-500" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={claiming || !trimmedDomain}
            className="bg-accent text-accent-foreground hover:bg-accent/90 mt-2 inline-flex w-fit items-center gap-2 rounded px-4 py-2 text-sm transition-all disabled:opacity-50"
          >
            <Globe className="h-4 w-4" />
            {claiming ? "Claiming..." : "Claim"}
          </button>
        </form>
        {claimError && <p className="text-danger mt-2 text-sm">{claimError}</p>}
        {claimStatus && (
          <p className="text-muted-foreground mt-2 text-sm">{claimStatus}</p>
        )}
      </section>

      {/* My domains */}
      <section className="mt-10">
        <h2 className="text-foreground text-lg font-semibold">My Domains</h2>
        {domainList.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            No domains claimed yet.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {domainList.map((d) => (
              <DomainCard
                key={d.id}
                domain={d.domain}
                openRegistration={d.openRegistration}
                allowThirdPartyDomains={d.allowThirdPartyDomains}
                onUpdate={async () => {
                  const updated = await getMyDomains();
                  setDomainList(updated);
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DomainCard({
  domain,
  openRegistration,
  allowThirdPartyDomains,
  onUpdate,
}: {
  domain: string;
  openRegistration: boolean;
  allowThirdPartyDomains: boolean;
  onUpdate: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [users, setUsers] = useState<
    { id: string; name: string | null; createdAt: Date }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Add user form
  const [showAddUser, setShowAddUser] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [checkingName, setCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [addError, setAddError] = useState("");
  const [addStatus, setAddStatus] = useState("");

  // Reset password
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetStatus, setResetStatus] = useState("");

  function extractName(address: string): string | null {
    const parsed = parseAddress(address);
    if (!parsed || parsed.domain !== domain) return null;
    const result = nameSchema.safeParse(parsed.name);
    if (!result.success) return null;
    return parsed.name;
  }

  function handleAddressChange(value: string) {
    setNewAddress(value);
    setNameAvailable(null);

    if (!value) {
      setAddressError("");
      return;
    }

    const parsed = parseAddress(value);
    if (!parsed) {
      setAddressError(`Enter a full address (e.g. alice@${domain})`);
      return;
    }
    if (parsed.domain !== domain) {
      setAddressError(`Domain must be ${domain}`);
      return;
    }

    const result = nameSchema.safeParse(parsed.name);
    if (!result.success) {
      setAddressError(result.error.issues[0]?.message ?? "Invalid name");
    } else {
      setAddressError("");
    }
  }

  async function handleAddressBlur() {
    const name = extractName(newAddress);
    if (!name || addressError) return;

    setCheckingName(true);
    setNameAvailable(null);
    try {
      // Use the admin variant: it authorizes via verifyDomainAdmin
      // instead of via the openRegistration flag, so domain admins can
      // create users even when public signup is closed.
      const result = await adminCheckNameAvailable({
        data: { name, domain },
      });
      if (result.error) {
        setAddressError(result.error);
      } else {
        setNameAvailable(result.available);
      }
    } catch {
      setAddressError("Failed to check availability");
    } finally {
      setCheckingName(false);
    }
  }

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const result = await getDomainUsersFn({ data: domain });
      setUsers(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand() {
    if (!expanded) {
      await loadUsers();
    }
    setExpanded(!expanded);
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddStatus("");

    const name = extractName(newAddress);
    if (!name) {
      setAddError("Please enter a valid address.");
      return;
    }
    if (addressError) {
      setAddError("Please fix the address error.");
      return;
    }
    if (nameAvailable === false) {
      setAddError("This name is already taken.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setAddError("Passwords do not match.");
      return;
    }

    try {
      setAddStatus("Deriving keys...");
      const passwordKey = await derivePasswordKey(newPassword);
      const loginKey = await deriveLoginKeyFromPasswordKey(passwordKey);
      const encryptionKey =
        await deriveEncryptionKeyFromPasswordKey(passwordKey);
      const { publicKey, encryptedPrivateKey } =
        await generateAndEncryptKeyPairFromEncryptionKey(encryptionKey);

      setAddStatus("Creating user...");
      await createDomainUserFn({
        data: {
          domain,
          name,
          loginKey,
          publicKey,
          encryptedPrivateKey,
        },
      });

      setNewAddress("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setNameAvailable(null);
      setShowAddUser(false);
      setAddStatus("");
      await loadUsers();
    } catch (err: unknown) {
      setAddError(
        err instanceof Error ? err.message : "Failed to create user.",
      );
      setAddStatus("");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUserId) return;
    setResetError("");
    setResetStatus("");

    if (resetPassword !== resetPasswordConfirm) {
      setResetError("Passwords do not match.");
      return;
    }

    try {
      setResetStatus("Deriving keys...");
      const passwordKey = await derivePasswordKey(resetPassword);
      const loginKey = await deriveLoginKeyFromPasswordKey(passwordKey);
      const encryptionKey =
        await deriveEncryptionKeyFromPasswordKey(passwordKey);
      const { publicKey, encryptedPrivateKey } =
        await generateAndEncryptKeyPairFromEncryptionKey(encryptionKey);

      setResetStatus("Resetting password...");
      await resetDomainUserPasswordFn({
        data: {
          domain,
          userId: resetUserId,
          newLoginKey: loginKey,
          publicKey,
          encryptedPrivateKey,
        },
      });

      setResetUserId(null);
      setResetPassword("");
      setResetPasswordConfirm("");
      setResetStatus("");
      await loadUsers();
    } catch (err: unknown) {
      setResetError(
        err instanceof Error ? err.message : "Failed to reset password.",
      );
      setResetStatus("");
    }
  }

  return (
    <div className="border-border/30 rounded border">
      <button
        onClick={toggleExpand}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Globe className="text-accent h-4 w-4 shrink-0" />
        <span className="text-foreground flex-1 text-sm font-medium">
          {domain}
        </span>
        {expanded ? (
          <ChevronUp className="text-muted-foreground h-4 w-4" />
        ) : (
          <ChevronDown className="text-muted-foreground h-4 w-4" />
        )}
      </button>

      {expanded && (
        <div className="border-border/30 border-t px-4 py-3">
          {/* Settings toggles */}
          <div className="mb-4 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={openRegistration}
                onChange={async (e) => {
                  try {
                    await toggleOpenRegistrationFn({
                      data: { domain, value: e.target.checked },
                    });
                    await onUpdate();
                  } catch {
                    // revert on error
                  }
                }}
                className="accent-accent"
              />
              <span className="text-foreground">Open registration</span>
              <span className="text-muted-foreground text-xs">
                (anyone can create an account)
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowThirdPartyDomains}
                onChange={async (e) => {
                  try {
                    await toggleAllowThirdPartyDomainsFn({
                      data: e.target.checked,
                    });
                    await onUpdate();
                  } catch {
                    // revert on error
                  }
                }}
                className="accent-accent"
              />
              <span className="text-foreground">Allow third-party domains</span>
              <span className="text-muted-foreground text-xs">
                (users can claim external domains)
              </span>
            </label>
          </div>

          {loading && (
            <p className="text-muted-foreground text-sm">Loading users...</p>
          )}
          {error && <p className="text-danger text-sm">{error}</p>}

          {!loading && users.length === 0 && !error && (
            <p className="text-muted-foreground text-sm">No users yet.</p>
          )}

          {users.length > 0 && (
            <div className="flex flex-col gap-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 py-1 text-sm"
                >
                  <span className="text-foreground flex-1">
                    {u.name}@{domain}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => {
                      setResetUserId(resetUserId === u.id ? null : u.id);
                      setResetPassword("");
                      setResetPasswordConfirm("");
                      setResetError("");
                      setResetStatus("");
                    }}
                    className="text-muted-foreground hover:text-foreground text-xs underline"
                  >
                    {resetUserId === u.id ? "Cancel" : "Reset password"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Reset password form */}
          {resetUserId && (
            <form
              onSubmit={handleResetPassword}
              className="mt-3 flex flex-col gap-2"
            >
              <div>
                <input
                  type="password"
                  placeholder="New password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="bg-background-dark border-border text-foreground w-full rounded border px-3 py-2 text-sm"
                  required
                />
                {resetPassword.length > 0 && (
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {resetPassword.length} characters
                    </span>
                    <span
                      className={entropyColor(
                        entropyTier(calculatePasswordEntropy(resetPassword)),
                      )}
                    >
                      {calculatePasswordEntropy(resetPassword).toFixed(1)} bits
                      —{" "}
                      {entropyLabel(
                        entropyTier(calculatePasswordEntropy(resetPassword)),
                      )}
                    </span>
                  </div>
                )}
              </div>
              <input
                type="password"
                placeholder="Confirm new password"
                value={resetPasswordConfirm}
                onChange={(e) => setResetPasswordConfirm(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-3 py-2 text-sm"
                required
              />
              {resetError && (
                <p className="text-danger text-sm">{resetError}</p>
              )}
              {resetStatus && (
                <p className="text-muted-foreground text-sm">{resetStatus}</p>
              )}
              <button
                type="submit"
                className="bg-accent text-accent-foreground hover:bg-accent/90 inline-flex w-fit items-center gap-2 rounded px-3 py-1.5 text-sm transition-all"
              >
                <RotateCw className="h-3 w-3" />
                Reset
              </button>
            </form>
          )}

          {/* Add user */}
          {!showAddUser ? (
            <button
              onClick={() => setShowAddUser(true)}
              className="text-accent hover:text-accent/80 mt-3 inline-flex items-center gap-1 text-sm"
            >
              <Plus className="h-3 w-3" />
              Add user
            </button>
          ) : (
            <form onSubmit={handleAddUser} className="mt-3 flex flex-col gap-2">
              <div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder={`alice@${domain}`}
                    value={newAddress}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    onBlur={handleAddressBlur}
                    className="bg-background-dark border-border text-foreground w-full rounded border px-3 py-2 pr-10 text-sm"
                    required
                  />
                  <div className="absolute top-1/2 right-3 -translate-y-1/2">
                    {checkingName && (
                      <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                    )}
                    {!checkingName && nameAvailable === true && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                    {!checkingName && nameAvailable === false && (
                      <X className="text-destructive h-4 w-4" />
                    )}
                  </div>
                </div>
                {addressError && (
                  <p className="text-destructive mt-1 text-xs">
                    {addressError}
                  </p>
                )}
                {!addressError && nameAvailable === false && (
                  <p className="text-destructive mt-1 text-xs">
                    This address is already taken
                  </p>
                )}
                {!addressError && nameAvailable === true && (
                  <p className="mt-1 text-xs text-green-500">
                    This address is available!
                  </p>
                )}
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-background-dark border-border text-foreground w-full rounded border px-3 py-2 text-sm"
                  required
                />
                {newPassword.length > 0 && (
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {newPassword.length} characters
                    </span>
                    <span
                      className={entropyColor(
                        entropyTier(calculatePasswordEntropy(newPassword)),
                      )}
                    >
                      {calculatePasswordEntropy(newPassword).toFixed(1)} bits —{" "}
                      {entropyLabel(
                        entropyTier(calculatePasswordEntropy(newPassword)),
                      )}
                    </span>
                  </div>
                )}
              </div>
              <input
                type="password"
                placeholder="Confirm password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                className="bg-background-dark border-border text-foreground w-full rounded border px-3 py-2 text-sm"
                required
              />
              {addError && <p className="text-danger text-sm">{addError}</p>}
              {addStatus && (
                <p className="text-muted-foreground text-sm">{addStatus}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!!addressError || nameAvailable === false}
                  className="bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-all disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddUser(false);
                    setNewAddress("");
                    setNewPassword("");
                    setNewPasswordConfirm("");
                    setAddressError("");
                    setNameAvailable(null);
                    setAddError("");
                    setAddStatus("");
                  }}
                  className="text-muted-foreground hover:text-foreground text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// Tiny syntax-highlighted JSON renderer for the keypears.json preview.
// The structure is fixed (one or two fields) so we don't need a full
// tokenizer — keys, strings, and punctuation are emitted by hand using
// existing theme tokens so it adapts to light/dark mode for free.
function HighlightedJson({
  apiDomain,
  admin,
}: {
  apiDomain: string;
  admin: string;
}) {
  return (
    <pre className="bg-background-dark border-border text-foreground overflow-x-auto rounded border p-4 font-mono text-sm leading-relaxed">
      <span className="text-muted-foreground">{"{"}</span>
      {"\n  "}
      <span className="text-accent">&quot;apiDomain&quot;</span>
      <span className="text-muted-foreground">: </span>
      <span className="text-green-500">&quot;{apiDomain}&quot;</span>
      {admin && (
        <>
          <span className="text-muted-foreground">,</span>
          {"\n  "}
          <span className="text-accent">&quot;admin&quot;</span>
          <span className="text-muted-foreground">: </span>
          <span className="text-green-500">&quot;{admin}&quot;</span>
        </>
      )}
      {"\n"}
      <span className="text-muted-foreground">{"}"}</span>
    </pre>
  );
}
