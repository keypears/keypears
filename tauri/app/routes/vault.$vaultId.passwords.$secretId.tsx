import type { MetaFunction } from "react-router";
import { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import { Eye, EyeOff, Edit, Trash2, RotateCcw, Globe, User, Mail, FileText } from "lucide-react";
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
import { useVault } from "~app/contexts/vault-context";
import { getPasswordHistory, createPasswordUpdate } from "~app/db/models/password";
import type { PasswordUpdateRow } from "~app/db/models/password";

export default function PasswordDetail() {
  const params = useParams();
  const { activeVault, decryptPassword } = useVault();

  const [password, setPassword] = useState<PasswordUpdateRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [decryptedPassword, setDecryptedPassword] = useState<string>("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load password
  useEffect(() => {
    const loadPassword = async () => {
      if (!params.secretId) return;

      setIsLoading(true);
      try {
        const history = await getPasswordHistory(params.secretId);
        if (history.length > 0) {
          setPassword(history[0]); // Latest update
        }
      } catch (error) {
        console.error("Failed to load password:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPassword();
  }, [params.secretId]);

  // Decrypt password when eye button is clicked
  const handleTogglePassword = () => {
    if (!password?.encryptedPassword) return;

    if (!showPassword) {
      try {
        const decrypted = decryptPassword(password.encryptedPassword);
        setDecryptedPassword(decrypted);
        setShowPassword(true);
      } catch (error) {
        console.error("Failed to decrypt password:", error);
      }
    } else {
      setShowPassword(false);
      setDecryptedPassword("");
    }
  };

  const handleDelete = async () => {
    if (!password || !activeVault) return;

    setIsDeleting(true);
    try {
      // Toggle the deleted flag
      await createPasswordUpdate({
        vaultId: activeVault.vaultId,
        secretId: password.secretId,
        name: password.name,
        domain: password.domain || undefined,
        username: password.username || undefined,
        email: password.email || undefined,
        notes: password.notes || undefined,
        encryptedPassword: password.encryptedPassword || undefined,
        deleted: !password.deleted, // Toggle instead of always true
      });

      // Reload the password data to show updated state
      const history = await getPasswordHistory(password.secretId);
      if (history.length > 0) {
        setPassword(history[0]);
      }
    } catch (error) {
      console.error("Failed to toggle password deleted state:", error);
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
        <Navbar showBackButton />
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
        <Navbar showBackButton />
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
      <Navbar showBackButton />
      <div className="mx-auto max-w-2xl px-4 py-8">
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
                  to={`/vault/${activeVault.vaultId}/passwords/${password.secretId}/edit`}
                >
                  <Edit size={18} />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowDeleteDialog(true)}
                aria-label={password.deleted ? "Restore password" : "Delete password"}
              >
                {password.deleted ? <RotateCcw size={18} /> : <Trash2 size={18} />}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Domain */}
            {password.domain && (
              <div className="space-y-2">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <Globe size={14} />
                  Domain
                </label>
                <p className="font-mono text-sm">{password.domain}</p>
              </div>
            )}

            {/* Username */}
            {password.username && (
              <div className="space-y-2">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <User size={14} />
                  Username
                </label>
                <p className="font-mono text-sm">{password.username}</p>
              </div>
            )}

            {/* Email */}
            {password.email && (
              <div className="space-y-2">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <Mail size={14} />
                  Email
                </label>
                <p className="font-mono text-sm">{password.email}</p>
              </div>
            )}

            {/* Password */}
            {password.encryptedPassword && (
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
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </Button>
                </div>
              </div>
            )}

            {/* Notes */}
            {password.notes && (
              <div className="space-y-2">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <FileText size={14} />
                  Notes
                </label>
                <p className="text-sm">{password.notes}</p>
              </div>
            )}
      </div>

      {/* Delete/Restore confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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

export const meta: MetaFunction = () => {
  return [
    { title: "Password Details | KeyPears" },
    { name: "description", content: "View password details" },
  ];
};
