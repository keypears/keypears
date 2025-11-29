import { useState, useEffect } from "react";
import { useParams, useNavigate, Link, href } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { Navbar } from "~app/components/navbar";
import { PasswordBreadcrumbs } from "~app/components/password-breadcrumbs";
import { useVault } from "~app/contexts/vault-context";
import { useServerStatus } from "~app/contexts/ServerStatusContext";
import { createApiClient } from "~app/lib/api-client";
import { getLatestSecret } from "~app/db/models/password";
import type { SecretUpdateRow } from "~app/db/models/password";
import { decryptSecretUpdateBlob } from "~app/lib/secret-encryption";
import type { SecretBlobData } from "~app/lib/secret-encryption";
import { pushSecretUpdate } from "~app/lib/sync";

export default function EditPassword() {
  const params = useParams();
  const navigate = useNavigate();
  const { activeVault, encryptPassword, decryptPassword, getLoginKey } = useVault();
  const { status, triggerSync } = useServerStatus();

  const [existingPassword, setExistingPassword] =
    useState<SecretUpdateRow | null>(null);
  const [existingBlob, setExistingBlob] = useState<SecretBlobData | null>(null);
  const [isLoadingPassword, setIsLoadingPassword] = useState(true);

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load existing password
  useEffect(() => {
    const loadPassword = async () => {
      if (!params.secretId || !activeVault) return;

      setIsLoadingPassword(true);
      try {
        const latest = await getLatestSecret(params.secretId);
        if (latest) {
          setExistingPassword(latest);

          // Decrypt blob to get current values
          const blob = decryptSecretUpdateBlob(
            latest.encryptedBlob,
            activeVault.vaultKey,
          );
          setExistingBlob(blob);

          // Pre-fill form fields
          setName(blob.name);
          setDomain(blob.domain || "");
          setUsername(blob.username || "");
          setEmail(blob.email || "");

          // Decrypt and pre-fill notes if present
          if (blob.encryptedNotes) {
            const decryptedNotes = decryptPassword(blob.encryptedNotes);
            setNotes(decryptedNotes);
          }

          // Do NOT pre-fill password field for security
        }
      } catch (error) {
        console.error("Failed to load password:", error);
      } finally {
        setIsLoadingPassword(false);
      }
    };

    loadPassword();
  }, [params.secretId, activeVault, decryptPassword]);

  if (!activeVault) {
    return null;
  }

  if (isLoadingPassword) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="border-border bg-card rounded-lg border p-8">
            <p className="text-muted-foreground text-center text-sm">
              Loading password...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!existingPassword) {
    return (
      <div className="bg-background min-h-screen">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="border-border bg-card rounded-lg border p-8">
            <p className="text-muted-foreground text-center text-sm">
              Password not found
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isValid = name.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid || !existingPassword || !existingBlob) return;

    // Check server status
    if (!status.isOnline) {
      setError("Server is offline. Cannot update secrets while offline.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // If password field is filled, encrypt new password
      // Otherwise, keep existing encrypted password
      const encryptedData = password
        ? encryptPassword(password)
        : existingBlob.encryptedData;

      // Encrypt notes if provided
      const encryptedNotes = notes.trim()
        ? encryptPassword(notes.trim())
        : undefined;

      // Create updated secret blob data
      const secretData: SecretBlobData = {
        name: name.trim(),
        type: existingBlob.type,
        domain: domain.trim() || undefined,
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        encryptedData,
        encryptedNotes,
        deleted: false,
      };

      // Create authenticated API client with login key
      const loginKey = getLoginKey();
      const authedClient = createApiClient(activeVault.vaultDomain, loginKey);

      // Push update to server (creates new version with higher localOrder)
      await pushSecretUpdate(
        activeVault.vaultId,
        existingPassword.secretId, // Same secretId for versioning
        secretData,
        activeVault.vaultKey,
        authedClient,
      );

      // Trigger immediate sync to fetch the updated secret
      await triggerSync();

      // Navigate back to password detail
      navigate(
        href("/vault/:vaultId/secrets/:secretId", {
          vaultId: activeVault.vaultId,
          secretId: existingPassword.secretId,
        }),
      );
    } catch (err) {
      console.error("Failed to update password:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update password",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PasswordBreadcrumbs
          vaultId={activeVault.vaultId}
          vaultName={activeVault.vaultName}
          vaultDomain={activeVault.vaultDomain}
          passwordName={existingPassword.name}
          passwordSecretId={existingPassword.secretId}
          currentPage="Edit"
        />
        <div className="border-border bg-card rounded-lg border p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Edit Password</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Update password information
            </p>
          </div>

          <div className="space-y-4">
            {/* Name field (required) */}
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., GitHub Account"
                autoFocus
              />
            </div>

            {/* Domain field */}
            <div className="space-y-2">
              <label htmlFor="domain" className="text-sm font-medium">
                Domain
              </label>
              <Input
                id="domain"
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="e.g., github.com"
              />
            </div>

            {/* Username field */}
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                Username
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g., alice"
              />
            </div>

            {/* Email field */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g., alice@example.com"
              />
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave empty to keep current password"
                  className="pr-10"
                />
                <div className="absolute top-1/2 right-2 -translate-y-1/2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </Button>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                Leave empty to keep the current password unchanged
              </p>
            </div>

            {/* Notes field */}
            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium">
                Notes
              </label>
              <Input
                id="notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes"
              />
            </div>

            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>

          <div className="mt-6 space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting || !status.isOnline}
            >
              {isSubmitting
                ? "Saving..."
                : !status.isOnline
                  ? "Server Offline"
                  : "Save Changes"}
            </Button>
            <Button asChild variant="outline" className="w-full" size="lg">
              <Link
                to={href("/vault/:vaultId/secrets/:secretId", {
                  vaultId: activeVault.vaultId,
                  secretId: existingPassword.secretId,
                })}
              >
                Cancel
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
