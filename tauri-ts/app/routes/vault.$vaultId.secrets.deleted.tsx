import type { Route } from "./+types/vault.$vaultId.secrets.deleted";
import { redirect, href } from "react-router";
import { getActiveVault, isVaultUnlocked } from "~app/lib/vault-store";
import { Navbar } from "~app/components/navbar";
import { PasswordBreadcrumbs } from "~app/components/password-breadcrumbs";
import { PasswordList } from "~app/components/password-list";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;

  if (!vaultId || !isVaultUnlocked(vaultId)) {
    throw redirect(href("/"));
  }

  const activeVault = getActiveVault();
  if (!activeVault) {
    throw redirect(href("/"));
  }

  return {
    vaultId: activeVault.vaultId,
    vaultName: activeVault.vaultName,
    vaultDomain: activeVault.vaultDomain,
  };
}

export default function VaultPasswordsDeleted({
  loaderData,
}: Route.ComponentProps) {
  const { vaultId, vaultName, vaultDomain } = loaderData;

  return (
    <div className="bg-background min-h-screen">
      <Navbar showBackButton />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PasswordBreadcrumbs
          vaultId={vaultId}
          vaultName={vaultName}
          vaultDomain={vaultDomain}
          currentPage="Deleted"
        />
        <PasswordList showDeleted={true} />
      </div>
    </div>
  );
}
