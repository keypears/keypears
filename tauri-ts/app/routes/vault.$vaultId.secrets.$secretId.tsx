import { useState, useEffect } from "react";
import { useParams, Link, href } from "react-router";
import {
  Eye,
  EyeOff,
  Edit,
  Trash2,
  RotateCcw,
  Globe,
  User,
  Mail,
  FileText,
} from "lucide-react";
import { Button } from "~app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~app/components/ui/alert-dialog";
import { Navbar } from "~app/components/navbar";
import { PasswordBreadcrumbs } from "~app/components/password-breadcrumbs";
import { useVault } from "~app/contexts/vault-context";
import { useServerStatus } from "~app/contexts/ServerStatusContext";
import { getLatestSecret } from "~app/db/models/password";
import type { SecretUpdateRow } from "~app/db/models/password";
import { decryptSecretUpdateBlob } from "~app/lib/secret-encryption";
import type { SecretBlobData } from "~app/lib/secret-encryption";
import { pushSecretUpdate, syncVault } from "~app/lib/sync";

export default function PasswordDetail() {
  const params = useParams();
  const { activeVault, decryptPassword } = useVault();
  const { status, client } = useServerStatus();

  const [password, setPassword] = useState<SecretUpdateRow | null>(null);
  const [decryptedBlob, setDecryptedBlob] = useState<SecretBlobData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [decryptedPassword, setDecryptedPassword] = useState<string>("");
  const [decryptedNotes, setDecryptedNotes] = useState<string>("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load password
  useEffect(() => {
    const loadPassword = async () => {
      if (!params.secretId || !activeVault) return;

      setIsLoading(true);
      try {
        const latest = await getLatestSecret(params.secretId);
        if (latest) {
          setPassword(latest);
          // Decrypt blob for display
          const blob = decryptSecretUpdateBlob(
            latest.encryptedBlob,
            activeVault.vaultKey,
          );
          setDecryptedBlob(blob);

          // Decrypt password field if present
          if (blob.encryptedData) {
            const pwd = decryptPassword(blob.encryptedData);
            setDecryptedPassword(pwd);
          }

          // Decrypt notes if present
          if (blob.encryptedNotes) {
            const notes = decryptPassword(blob.encryptedNotes);
            setDecryptedNotes(notes);
          }
        }
      } catch (error) {
        console.error("Failed to load password:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPassword();
  }, [params.secretId, activeVault, decryptPassword]);

  // Toggle password visibility
  const handleTogglePassword = () => {
    if (!decryptedBlob?.encryptedData) return;
    setShowPassword(!showPassword);
  };

  const handleDelete = async () => {
    if (!password || !activeVault || !decryptedBlob) return;

    // Check server status
    if (!status.isOnline) {
      alert("Server is offline. Cannot delete secrets while offline.");
      setShowDeleteDialog(false);
      return;
    }

    setIsDeleting(true);
    try {
      // Create tombstone version (same data but deleted: true)
      const secretData: SecretBlobData = {
        ...decryptedBlob,
        deleted: !password.deleted, // Toggle deleted state
      };

      // Push tombstone to server (creates new version with higher localOrder)
      await pushSecretUpdate(
        activeVault.vaultId,
        password.secretId,
        secretData,
        activeVault.vaultKey,
        client,
      );

      // Sync vault to fetch the tombstone
      await syncVault(activeVault.vaultId, activeVault.vaultKey, client);

      // Reload the secret to show updated state
      const latest = await getLatestSecret(password.secretId);
      if (latest) {
        setPassword(latest);
        const blob = decryptSecretUpdateBlob(
          latest.encryptedBlob,
          activeVault.vaultKey,
        );
        setDecryptedBlob(blob);

        // Decrypt password and notes if present
        if (blob.encryptedData) {
          const pwd = decryptPassword(blob.encryptedData);
          setDecryptedPassword(pwd);
        }
        if (blob.encryptedNotes) {
          const notes = decryptPassword(blob.encryptedNotes);
          setDecryptedNotes(notes);
        }
      }
    } catch (error) {
      console.error("Failed to toggle password deleted state:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to toggle deleted state",
      );
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (!activeVault) {
    return null;
  }

  if (isLoading) {
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

  if (!password) {
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

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PasswordBreadcrumbs
          vaultId={activeVault.vaultId}
          vaultName={activeVault.vaultName}
          vaultDomain={activeVault.vaultDomain}
          passwordName={password.name}
          passwordSecretId={password.secretId}
        />
        <div className="border-border bg-card rounded-lg border p-8">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{password.name}</h1>
                {password.deleted && (
                  <span className="text-destructive rounded bg-red-500/10 px-2 py-1 text-xs font-medium">
                    DELETED
                  </span>
                )}
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                Password details
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                asChild
                variant="outline"
                size="icon"
                aria-label="Edit password"
              >
                <Link
                  to={href("/vault/:vaultId/secrets/:secretId/edit", {
                    vaultId: activeVault.vaultId,
                    secretId: password.secretId,
                  })}
                >
                  <Edit size={18} />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowDeleteDialog(true)}
                aria-label={
                  password.deleted ? "Restore password" : "Delete password"
                }
              >
                {password.deleted ? (
                  <RotateCcw size={18} />
                ) : (
                  <Trash2 size={18} />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Domain */}
            {decryptedBlob?.domain && (
              <div className="space-y-2">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <Globe size={14} />
                  Domain
                </label>
                <p className="font-mono text-sm">{decryptedBlob.domain}</p>
              </div>
            )}

            {/* Username */}
            {decryptedBlob?.username && (
              <div className="space-y-2">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <User size={14} />
                  Username
                </label>
                <p className="font-mono text-sm">{decryptedBlob.username}</p>
              </div>
            )}

            {/* Email */}
            {decryptedBlob?.email && (
              <div className="space-y-2">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <Mail size={14} />
                  Email
                </label>
                <p className="font-mono text-sm">{decryptedBlob.email}</p>
              </div>
            )}

            {/* Password */}
            {decryptedBlob?.encryptedData && (
              <div className="space-y-2">
                <label className="text-muted-foreground text-xs font-medium">
                  Password
                </label>
                <div className="flex items-center gap-2">
                  <div className="border-border bg-muted flex-1 rounded-md border px-3 py-2">
                    <p className="font-mono text-sm">
                      {showPassword ? decryptedPassword : "••••••••••••"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleTogglePassword}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </Button>
                </div>
              </div>
            )}

            {/* Notes */}
            {decryptedBlob?.encryptedNotes && (
              <div className="space-y-2">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <FileText size={14} />
                  Notes
                </label>
                <p className="text-sm">{decryptedNotes}</p>
              </div>
            )}
          </div>

          {/* Delete/Restore confirmation dialog */}
          <AlertDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {password.deleted ? "Restore Password?" : "Delete Password?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {password.deleted
                    ? "This will restore the password and make it active again."
                    : "This will mark the password as deleted. You can still see it in the Deleted tab."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className={
                    password.deleted
                      ? ""
                      : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  }
                >
                  {isDeleting
                    ? password.deleted
                      ? "Restoring..."
                      : "Deleting..."
                    : password.deleted
                      ? "Restore"
                      : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
