import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Key, Plus, Globe, User } from "lucide-react";
import { Button } from "~app/components/ui/button";
import { getCurrentPasswords } from "~app/db/models/password";
import type { PasswordUpdateRow } from "~app/db/models/password";
import { useVault } from "~app/contexts/vault-context";

interface PasswordListProps {
  showDeleted?: boolean;
}

export function PasswordList({ showDeleted = false }: PasswordListProps) {
  const { activeVault } = useVault();
  const [passwords, setPasswords] = useState<PasswordUpdateRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadPasswords = async () => {
      if (!activeVault) return;

      setIsLoading(true);
      try {
        const currentPasswords = await getCurrentPasswords(activeVault.vaultId);
        setPasswords(currentPasswords);
      } catch (error) {
        console.error("Failed to load passwords:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPasswords();
  }, [activeVault]);

  // Filter passwords based on showDeleted prop
  const filteredPasswords = passwords.filter(
    (p) => p.deleted === showDeleted
  );

  if (!activeVault) {
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
            {showDeleted ? "No deleted passwords" : "No passwords yet"}
          </h2>
          <p className="text-muted-foreground mb-6 text-sm">
            {showDeleted
              ? "Deleted passwords will appear here"
              : "Get started by adding your first password"}
          </p>
          {!showDeleted && (
            <Button asChild size="lg" className="w-full">
              <Link to={`/vault/${activeVault.vaultId}/passwords/new`}>
                <Plus size={20} className="mr-2" />
                New Password
              </Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with New Password button */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {showDeleted ? "Deleted Passwords" : "Passwords"}
        </h1>
        {!showDeleted && (
          <Button asChild>
            <Link to={`/vault/${activeVault.vaultId}/passwords/new`}>
              <Plus size={20} className="mr-2" />
              New Password
            </Link>
          </Button>
        )}
      </div>

      {/* Password list */}
      <div className="space-y-3">
        {filteredPasswords.map((password) => (
          <Link
            key={password.id}
            to={`/vault/${activeVault.vaultId}/passwords/${password.secretId}`}
            className="block"
          >
            <div className="border-border bg-card hover:bg-accent rounded-lg border p-4 transition-colors">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 mt-1 rounded-full p-2">
                  <Key className="text-primary h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{password.name}</h3>
                    {password.deleted && (
                      <span className="text-destructive rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium">
                        DELETED
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-1 space-y-1 text-sm">
                    {password.domain && (
                      <div className="flex items-center gap-1.5">
                        <Globe size={14} />
                        <span className="truncate">{password.domain}</span>
                      </div>
                    )}
                    {password.username && (
                      <div className="flex items-center gap-1.5">
                        <User size={14} />
                        <span className="truncate">{password.username}</span>
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
