import type { Route } from "./+types/vault.$vaultId.passwords.$secretId";
import { useState } from "react";
import { Link, href, redirect, useRevalidator } from "react-router";
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
import { Breadcrumbs } from "~app/components/breadcrumbs";
import {
  getUnlockedVault,
  isVaultUnlocked,
  decryptPassword as decryptPasswordFromStore,
  getVaultKey,
} from "~app/lib/vault-store";
import { useServerStatus } from "~app/contexts/ServerStatusContext";
import { getLatestSecret } from "~app/db/models/password";
import { decryptSecretUpdateBlob } from "~app/lib/secret-encryption";
import type { SecretBlobData } from "~app/lib/secret-encryption";
import { pushSecretUpdate } from "~app/lib/sync";
import { triggerManualSync } from "~app/lib/sync-service";

interface LoaderData {
  vaultId: string;
  secretId: string;
  passwordName: string;
  isDeleted: boolean;
  decryptedBlob: SecretBlobData;
  decryptedPassword: string;
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
  const decryptedBlob = decryptSecretUpdateBlob(latest.encryptedBlob, vaultKey);

  // Decrypt password field if present
  const decryptedPassword = decryptedBlob.encryptedData
    ? decryptPasswordFromStore(vaultId, decryptedBlob.encryptedData)
    : "";

  // Decrypt notes if present
  const decryptedNotes = decryptedBlob.encryptedNotes
    ? decryptPasswordFromStore(vaultId, decryptedBlob.encryptedNotes)
    : "";

  return {
    vaultId: vault.vaultId,
    secretId: latest.secretId,
    passwordName: latest.name,
    isDeleted: latest.deleted,
    decryptedBlob,
    decryptedPassword,
    decryptedNotes,
  };
}

export default function PasswordDetail({ loaderData }: Route.ComponentProps) {
  const {
    vaultId,
    secretId,
    passwordName,
    isDeleted,
    decryptedBlob,
    decryptedPassword,
    decryptedNotes,
  } = loaderData;

  const { status, client } = useServerStatus();
  const revalidator = useRevalidator();

  const [showPassword, setShowPassword] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleTogglePassword = () => {
    if (!decryptedBlob?.encryptedData) return;
    setShowPassword(!showPassword);
  };

  const handleDelete = async () => {
    if (!decryptedBlob) return;

    // Check server status
    if (!status.isOnline) {
      alert("Server is offline. Cannot delete passwords while offline.");
      setShowDeleteDialog(false);
      return;
    }

    setIsDeleting(true);
    try {
      // Create tombstone version (same data but deleted: true)
      const secretData: SecretBlobData = {
        ...decryptedBlob,
        deleted: !isDeleted, // Toggle deleted state
      };

      // Push tombstone to server (creates new version with higher localOrder)
      const vaultKey = getVaultKey(vaultId);
      await pushSecretUpdate(vaultId, secretId, secretData, vaultKey, client);

      // Trigger immediate sync to fetch the tombstone
      await triggerManualSync(vaultId);

      // Revalidate to reload the data
      revalidator.revalidate();
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

  return (
    <div className="bg-background min-h-screen">
      <Navbar vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Breadcrumbs
          vaultId={vaultId}
          secretName={passwordName}
          secretId={secretId}
        />
        <div className="border-border bg-card rounded-lg border p-8">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{passwordName}</h1>
                {isDeleted && (
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
                disabled={!status.isOnline}
              >
                <Link
                  to={href("/vault/:vaultId/passwords/:secretId/edit", {
                    vaultId,
                    secretId,
                  })}
                >
                  <Edit size={18} />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowDeleteDialog(true)}
                disabled={!status.isOnline}
                aria-label={isDeleted ? "Restore password" : "Delete password"}
              >
                {isDeleted ? <RotateCcw size={18} /> : <Trash2 size={18} />}
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
                  {isDeleted ? "Restore Password?" : "Delete Password?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isDeleted
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
                    isDeleted
                      ? ""
                      : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  }
                >
                  {isDeleting
                    ? isDeleted
                      ? "Restoring..."
                      : "Deleting..."
                    : isDeleted
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
