import { useState, useEffect } from "react";
import { Link, href } from "react-router";
import { Key, Plus, Globe, User, Trash2 } from "lucide-react";
import { Button } from "~app/components/ui/button";
import { getAllCurrentSecrets } from "~app/db/models/password";
import type { SecretUpdateRow } from "~app/db/models/password";
import { getActiveVault, getVaultKey } from "~app/lib/vault-store";
import { decryptSecretUpdateBlob } from "~app/lib/secret-encryption";
import type { SecretBlobData } from "~app/lib/secret-encryption";

interface PasswordListProps {
  showDeleted?: boolean;
}

interface DecryptedSecret extends SecretUpdateRow {
  decryptedBlob: SecretBlobData;
}

export function PasswordList({ showDeleted = false }: PasswordListProps) {
  const [passwords, setPasswords] = useState<DecryptedSecret[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [vaultId, setVaultId] = useState<string | null>(null);

  useEffect(() => {
    const loadPasswords = async () => {
      const activeVault = getActiveVault();
      if (!activeVault) return;

      setVaultId(activeVault.vaultId);
      setIsLoading(true);
      try {
        const vaultKey = getVaultKey();
        const currentSecrets = await getAllCurrentSecrets(activeVault.vaultId);

        // Decrypt blobs for display (domain, username, etc.)
        const decryptedSecrets = currentSecrets.map((secret) => ({
          ...secret,
          decryptedBlob: decryptSecretUpdateBlob(secret.encryptedBlob, vaultKey),
        }));

        setPasswords(decryptedSecrets);
      } catch (error) {
        console.error("Failed to load passwords:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPasswords();
  }, []);

  // Filter passwords based on showDeleted prop
  const filteredPasswords = passwords.filter((p) => p.deleted === showDeleted);

  if (!vaultId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="border-border bg-card rounded-lg border p-8">
        <div className="flex flex-col items-center text-center">
          <p className="text-muted-foreground text-sm">Loading passwords...</p>
        </div>
      </div>
    );
  }

  if (filteredPasswords.length === 0) {
    return (
      <div className="border-border bg-card rounded-lg border p-8">
        <div className="flex flex-col items-center text-center">
          <div className="bg-primary/10 mb-4 rounded-full p-4">
            <Key className="text-primary h-8 w-8" />
          </div>
          <h2 className="mb-2 text-xl font-semibold">
            {showDeleted ? "No deleted secrets" : "No secrets yet"}
          </h2>
          <p className="text-muted-foreground mb-6 text-sm">
            {showDeleted
              ? "Deleted secrets will appear here"
              : "Get started by adding your first password"}
          </p>
          {!showDeleted && (
            <Button asChild size="lg" className="w-full">
              <Link
                to={href("/vault/:vaultId/secrets/new", {
                  vaultId,
                })}
              >
                <Plus size={20} className="mr-2" />
                New Secret
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
          {showDeleted ? "Deleted Secrets" : "Secrets"}
        </h1>
        {!showDeleted && (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link
                to={href("/vault/:vaultId/secrets/deleted", {
                  vaultId,
                })}
              >
                <Trash2 size={18} className="mr-2" />
                Deleted
              </Link>
            </Button>
            <Button asChild>
              <Link
                to={href("/vault/:vaultId/secrets/new", {
                  vaultId,
                })}
              >
                <Plus size={20} className="mr-2" />
                New Secret
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
            to={href("/vault/:vaultId/secrets/:secretId", {
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
