import type { Route } from "./+types/vault.$vaultId.passwords.$secretId_.edit";
import { useState } from "react";
import { useNavigate, Link, href, redirect } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { Navbar } from "~app/components/navbar";
import { Breadcrumbs } from "~app/components/breadcrumbs";
import {
  getUnlockedVault,
  isVaultUnlocked,
  encryptPassword as encryptPasswordFromStore,
  decryptPassword as decryptPasswordFromStore,
  getVaultKey,
  getSessionToken,
} from "~app/lib/vault-store";
import { useServerStatus } from "~app/contexts/ServerStatusContext";
import { createClientFromDomain } from "@keypears/api-client";
import { getLatestSecret } from "~app/db/models/password";
import { decryptSecretUpdateBlob } from "~app/lib/secret-encryption";
import type { SecretBlobData } from "~app/lib/secret-encryption";
import { pushSecretUpdate } from "~app/lib/sync";
import { triggerManualSync } from "~app/lib/sync-service";

interface LoaderData {
  vaultId: string;
  vaultDomain: string;
  secretId: string;
  passwordName: string;
  existingBlob: SecretBlobData;
  decryptedNotes: string;
}

export async function clientLoader({
  params,
}: Route.ClientLoaderArgs): Promise<LoaderData | Response> {
  const { vaultId, secretId } = params;

  if (!vaultId || !secretId || !isVaultUnlocked(vaultId)) {
    throw redirect(href("/"));
  }

  const vault = getUnlockedVault(vaultId);
  if (!vault) {
    throw redirect(href("/"));
  }

  // Load the password from the database
  const latest = await getLatestSecret(secretId);
  if (!latest) {
    throw redirect(href("/vault/:vaultId/passwords", { vaultId }));
  }

  // Decrypt the blob
  const vaultKey = getVaultKey(vaultId);
  const existingBlob = decryptSecretUpdateBlob(latest.encryptedBlob, vaultKey);

  // Decrypt notes if present
  const decryptedNotes = existingBlob.encryptedNotes
    ? decryptPasswordFromStore(vaultId, existingBlob.encryptedNotes)
    : "";

  return {
    vaultId: vault.vaultId,
    vaultDomain: vault.vaultDomain,
    secretId: latest.secretId,
    passwordName: latest.name,
    existingBlob,
    decryptedNotes,
  };
}

export default function EditPassword({ loaderData }: Route.ComponentProps) {
  const {
    vaultId,
    vaultDomain,
    secretId,
    passwordName,
    existingBlob,
    decryptedNotes: initialNotes,
  } = loaderData;

  const navigate = useNavigate();
  const { status } = useServerStatus();

  const [name, setName] = useState(existingBlob.name);
  const [domain, setDomain] = useState(existingBlob.domain || "");
  const [username, setUsername] = useState(existingBlob.username || "");
  const [email, setEmail] = useState(existingBlob.email || "");
  const [notes, setNotes] = useState(initialNotes);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isValid = name.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid) return;

    // Check server status
    if (!status.isOnline) {
      setError("Server is offline. Cannot update passwords while offline.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // If password field is filled, encrypt new password
      // Otherwise, keep existing encrypted password
      const encryptedData = password
        ? encryptPasswordFromStore(vaultId, password)
        : existingBlob.encryptedData;

      // Encrypt notes if provided
      const encryptedNotes = notes.trim()
        ? encryptPasswordFromStore(vaultId, notes.trim())
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

      // Create authenticated API client with session token
      const sessionToken = getSessionToken(vaultId);
      const authedClient = await createClientFromDomain(vaultDomain, {
        sessionToken: sessionToken || undefined,
      });

      // Get vault key for encryption
      const vaultKey = getVaultKey(vaultId);

      // Push update to server and save locally (creates new version with higher localOrder)
      await pushSecretUpdate({
        vaultId,
        secretId, // Same secretId for versioning
        secretData,
        vaultKey,
        apiClient: authedClient,
        isRead: true, // User-initiated action
      });

      // Still trigger sync to fetch any other updates
      await triggerManualSync(vaultId);

      // Navigate back to password detail
      navigate(
        href("/vault/:vaultId/passwords/:secretId", {
          vaultId,
          secretId,
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
      <Navbar vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Breadcrumbs
          vaultId={vaultId}
          secretName={passwordName}
          secretId={secretId}
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
                to={href("/vault/:vaultId/passwords/:secretId", {
                  vaultId,
                  secretId,
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
