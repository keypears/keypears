import type { Route } from "./+types/vault.$vaultId.passwords.deleted";
import { redirect, href } from "react-router";
import { isVaultUnlocked } from "~app/lib/vault-store";
import { Navbar } from "~app/components/navbar";
import { Breadcrumbs } from "~app/components/breadcrumbs";
import { PasswordList } from "~app/components/password-list";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;

  if (!vaultId || !isVaultUnlocked(vaultId)) {
    throw redirect(href("/"));
  }

  return { vaultId };
}

export default function VaultPasswordsDeleted({
  loaderData,
}: Route.ComponentProps) {
  const { vaultId } = loaderData;

  return (
    <div className="bg-background min-h-screen">
      <Navbar showBackButton vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Breadcrumbs vaultId={vaultId} currentPage="Deleted" />
        <PasswordList showDeleted={true} />
      </div>
    </div>
  );
}
