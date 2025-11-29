import type { Route } from "./+types/_index";
import { Link, href } from "react-router";
import { Lock, X } from "lucide-react";
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
import { initDb } from "~app/db";
import { useState, useEffect } from "react";

export async function clientLoader(_args: Route.ClientLoaderArgs) {
  await initDb();
  const vaults = await getVaults();
  return { vaults };
}

export default function AppIndex({ loaderData }: Route.ComponentProps) {
  const [vaults, setVaults] = useState(loaderData.vaults);
  const [vaultToDelete, setVaultToDelete] = useState<Vault | null>(null);

  // Sync local state with loaderData when it changes
  useEffect(() => {
    setVaults(loaderData.vaults);
  }, [loaderData.vaults]);

  const handleDelete = async () => {
    if (!vaultToDelete) return;

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
              <Button asChild>
                <Link to={href("/new-vault/1")}>Create Vault</Link>
              </Button>
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
                  Create your first vault to get started
                </p>
                <Button size="lg" className="w-full" asChild>
                  <Link to={href("/new-vault/1")}>Create Vault</Link>
                </Button>
              </div>
            </div>
          ) : (
            /* Vault List */
            <div className="space-y-3">
              {vaults.map((vault) => (
                <div
                  key={vault.id}
                  className="border-border bg-card hover:bg-accent rounded-lg border p-4 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Link
                      to={href("/unlock-vault/:vaultId", { vaultId: vault.id })}
                      className="flex flex-1 items-center gap-3"
                    >
                      <div className="bg-primary/10 rounded-full p-2">
                        <Lock className="text-primary h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">
                          {vault.name}@{vault.domain}
                        </h3>
                        <p className="text-muted-foreground font-mono text-xs">
                          {vault.id.slice(0, 8)}
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
              ))}
            </div>
          )}
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
