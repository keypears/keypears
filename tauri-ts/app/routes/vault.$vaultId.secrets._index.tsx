import type { Route } from "./+types/vault.$vaultId.secrets._index";
import { redirect, href } from "react-router";
import { getUnlockedVault, isVaultUnlocked } from "~app/lib/vault-store";
import { Navbar } from "~app/components/navbar";
import { PasswordBreadcrumbs } from "~app/components/password-breadcrumbs";
import { PasswordList } from "~app/components/password-list";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;

  if (!vaultId || !isVaultUnlocked(vaultId)) {
    throw redirect(href("/"));
  }

  const vault = getUnlockedVault(vaultId);
  if (!vault) {
    throw redirect(href("/"));
  }

  return {
    vaultId: vault.vaultId,
    vaultName: vault.vaultName,
    vaultDomain: vault.vaultDomain,
  };
}

export default function VaultPasswordsIndex({
  loaderData,
}: Route.ComponentProps) {
  const { vaultId, vaultName, vaultDomain } = loaderData;

  return (
    <div className="bg-background min-h-screen">
      <Navbar vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PasswordBreadcrumbs
          vaultId={vaultId}
          vaultName={vaultName}
          vaultDomain={vaultDomain}
        />
        <PasswordList showDeleted={false} />
      </div>
    </div>
  );
}
