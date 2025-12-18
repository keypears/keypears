import type { Route } from "./+types/_index";
import { Link, href } from "react-router";
import { Lock, LockOpen, X } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";
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
import { getVaults, deleteVault, type Vault } from "~app/db/models/vault";
import { formatRelativeTime } from "~app/lib/format";
import { initDb, getDbFileInfo } from "~app/db";
import { formatBytes } from "@keypears/lib";
import { useState, useEffect } from "react";
import { getAllUnlockedVaultIds, lockVault } from "~app/lib/vault-store";
import { useAllUnreadCounts, clearSyncState } from "~app/contexts/sync-context";
import { stopBackgroundSync } from "~app/lib/sync-service";

export async function clientLoader(_args: Route.ClientLoaderArgs) {
  await initDb();
  const [vaults, dbInfo] = await Promise.all([getVaults(), getDbFileInfo()]);
  return { vaults, dbInfo };
}

// Poll interval for checking vault state
const VAULT_POLL_INTERVAL = 500; // 500ms

export default function AppIndex({ loaderData }: Route.ComponentProps) {
  const [vaults, setVaults] = useState(loaderData.vaults);
  const [vaultToDelete, setVaultToDelete] = useState<Vault | null>(null);
  const [unlockedVaultIds, setUnlockedVaultIds] = useState<Set<string>>(
    () => new Set(getAllUnlockedVaultIds()),
  );
  const unreadCounts = useAllUnreadCounts();

  // Sync local state with loaderData when it changes
  useEffect(() => {
    setVaults(loaderData.vaults);
  }, [loaderData.vaults]);

  // Poll vault-store for unlocked vault changes
  useEffect(() => {
    const interval = setInterval(() => {
      const currentUnlockedIds = getAllUnlockedVaultIds();
      setUnlockedVaultIds(new Set(currentUnlockedIds));
    }, VAULT_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const handleDelete = async () => {
    if (!vaultToDelete) return;

    // If the vault is unlocked, clean up its state
    if (unlockedVaultIds.has(vaultToDelete.id)) {
      stopBackgroundSync(vaultToDelete.id);
      clearSyncState(vaultToDelete.id);
      lockVault(vaultToDelete.id);
    }

    await deleteVault(vaultToDelete.id);
    const updatedVaults = await getVaults();
    setVaults(updatedVaults);
    setVaultToDelete(null);
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col px-4 py-8">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Vaults</h1>
            {vaults.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link to={href("/import-vault")}>Import Vault</Link>
                </Button>
                <Button asChild>
                  <Link to={href("/new-vault/1")}>Create Vault</Link>
                </Button>
              </div>
            )}
          </div>

          {vaults.length === 0 ? (
            /* Empty State */
            <div className="border-border bg-card rounded-lg border p-8">
              <div className="flex flex-col items-center text-center">
                <div className="bg-primary/10 mb-4 rounded-full p-4">
                  <Lock className="text-primary h-8 w-8" />
                </div>
                <h2 className="mb-2 text-xl font-semibold">No vaults yet</h2>
                <p className="text-muted-foreground mb-6 text-sm">
                  Create your first vault or import an existing one
                </p>
                <div className="flex w-full gap-2">
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1"
                    asChild
                  >
                    <Link to={href("/import-vault")}>Import Vault</Link>
                  </Button>
                  <Button size="lg" className="flex-1" asChild>
                    <Link to={href("/new-vault/1")}>Create Vault</Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* Vault List */
            <div className="space-y-3">
              {vaults.map((vault) => {
                const isUnlocked = unlockedVaultIds.has(vault.id);
                const unreadCount = unreadCounts.get(vault.id) ?? 0;
                return (
                  <div
                    key={vault.id}
                    className="border-border bg-card hover:bg-accent rounded-lg border p-4 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Link
                        to={
                          isUnlocked
                            ? href("/vault/:vaultId/passwords", {
                                vaultId: vault.id,
                              })
                            : href("/unlock-vault/:vaultId", {
                                vaultId: vault.id,
                              })
                        }
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <div className="bg-primary/10 relative rounded-full p-2">
                          {isUnlocked ? (
                            <LockOpen className="text-primary h-4 w-4" />
                          ) : (
                            <Lock className="text-primary h-4 w-4" />
                          )}
                          {isUnlocked && unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
                              {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-semibold">
                              {vault.name}@{vault.domain}
                            </h3>
                            {isUnlocked && (
                              <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                                Unlocked
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground text-xs">
                            {formatRelativeTime(vault.lastAccessedAt)}
                          </p>
                        </div>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete vault"
                        onClick={(e) => {
                          e.stopPropagation();
                          setVaultToDelete(vault);
                        }}
                      >
                        <X size={20} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Database Info */}
          <div className="border-border bg-card/50 mt-8 rounded-lg border p-4">
            <div className="text-muted-foreground space-y-1 text-xs">
              <p className="text-foreground/70 font-medium">Database</p>
              <p className="truncate font-mono" title={loaderData.dbInfo.path}>
                {loaderData.dbInfo.path}
              </p>
              {loaderData.dbInfo.size != null && (
                <p>{formatBytes(loaderData.dbInfo.size)}</p>
              )}
              <p className="mt-2">
                Your client-side database includes private meta information like
                the names of your passwords (but not the passwords themselves,
                which are encrypted). Do not share it with anyone.
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!vaultToDelete}
        onOpenChange={(open: boolean) => !open && setVaultToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vault?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the vault{" "}
              <span className="font-semibold">
                {vaultToDelete?.name}@{vaultToDelete?.domain}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
