import type { MetaFunction } from "react-router";
import { useVault } from "~app/contexts/vault-context";
import { Navbar } from "~app/components/navbar";
import { PasswordBreadcrumbs } from "~app/components/password-breadcrumbs";
import { PasswordTabsNav } from "~app/components/password-tabs-nav";
import { PasswordList } from "~app/components/password-list";

export default function VaultPasswordsIndex() {
  const { activeVault } = useVault();

  if (!activeVault) {
    return null;
  }

  return (
    <div className="bg-background min-h-screen">
      <Navbar showBackButton />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PasswordBreadcrumbs
          vaultId={activeVault.vaultId}
          vaultName={activeVault.vaultName}
        />
        <PasswordTabsNav vaultId={activeVault.vaultId} activeTab="active" />
        <PasswordList showDeleted={false} />
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [
    { title: "Secrets | KeyPears" },
    { name: "description", content: "Manage your secrets" },
  ];
};
