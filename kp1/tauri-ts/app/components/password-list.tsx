import { Link, href, useParams } from "react-router";
import { Key, Plus, Globe, User, Trash2 } from "lucide-react";
import { Button } from "~app/components/ui/button";
import type { SecretUpdateRow } from "~app/db/models/password";
import type { SecretBlobData } from "~app/lib/secret-encryption";

/**
 * Decrypted secret with blob data for display
 * Exported for use in route loaders
 */
export interface DecryptedSecret extends SecretUpdateRow {
  decryptedBlob: SecretBlobData;
}

interface PasswordListProps {
  passwords: DecryptedSecret[];
  showDeleted?: boolean;
}

export function PasswordList({
  passwords,
  showDeleted = false,
}: PasswordListProps) {
  const params = useParams<{ vaultId: string }>();
  const vaultId = params.vaultId;

  // Filter passwords based on showDeleted prop and exclude messages
  const filteredPasswords = passwords.filter((p) => {
    // Exclude messages from password list (double-check, should already be excluded by loader)
    if (p.decryptedBlob.type === "message") return false;
    return p.deleted === showDeleted;
  });

  if (!vaultId) {
    return null;
  }

  if (filteredPasswords.length === 0) {
    return (
      <div className="border-border bg-card rounded-lg border p-8">
        <div className="flex flex-col items-center text-center">
          <div className="bg-primary/10 mb-4 rounded-full p-4">
            <Key className="text-primary h-8 w-8" />
          </div>
          <h2 className="mb-2 text-xl font-semibold">
            {showDeleted ? "No deleted passwords" : "No passwords yet"}
          </h2>
          <p className="text-muted-foreground mb-6 text-sm">
            {showDeleted
              ? "Deleted passwords will appear here"
              : "Get started by adding your first password"}
          </p>
          {!showDeleted && (
            <Button asChild size="lg" className="w-full">
              <Link
                to={href("/vault/:vaultId/passwords/new", {
                  vaultId,
                })}
              >
                <Plus size={20} className="mr-2" />
                New
              </Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with buttons */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {showDeleted ? "Deleted Passwords" : "Passwords"}
        </h1>
        {!showDeleted && (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link
                to={href("/vault/:vaultId/passwords/deleted", {
                  vaultId,
                })}
              >
                <Trash2 size={18} className="mr-2" />
                Deleted
              </Link>
            </Button>
            <Button asChild>
              <Link
                to={href("/vault/:vaultId/passwords/new", {
                  vaultId,
                })}
              >
                <Plus size={20} className="mr-2" />
                New
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Password list */}
      <div className="space-y-3">
        {filteredPasswords.map((password) => (
          <Link
            key={password.id}
            to={href("/vault/:vaultId/passwords/:secretId", {
              vaultId,
              secretId: password.secretId,
            })}
            className="block"
          >
            <div className="border-border bg-card hover:bg-accent rounded-lg border p-4 transition-colors">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 mt-1 rounded-full p-2">
                  <Key className="text-primary h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold">{password.name}</h3>
                    {password.deleted && (
                      <span className="text-destructive rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium">
                        DELETED
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-1 space-y-1 text-sm">
                    {password.decryptedBlob.domain && (
                      <div className="flex items-center gap-1.5">
                        <Globe size={14} />
                        <span className="truncate">
                          {password.decryptedBlob.domain}
                        </span>
                      </div>
                    )}
                    {password.decryptedBlob.username && (
                      <div className="flex items-center gap-1.5">
                        <User size={14} />
                        <span className="truncate">
                          {password.decryptedBlob.username}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
