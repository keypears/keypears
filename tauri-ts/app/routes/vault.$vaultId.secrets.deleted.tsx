import { useVault } from "~app/contexts/vault-context";
import { Navbar } from "~app/components/navbar";
import { PasswordBreadcrumbs } from "~app/components/password-breadcrumbs";
import { PasswordList } from "~app/components/password-list";

export default function VaultPasswordsDeleted() {
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
          vaultDomain={activeVault.vaultDomain}
          currentPage="Deleted"
        />
        <PasswordList showDeleted={true} />
      </div>
    </div>
  );
}
