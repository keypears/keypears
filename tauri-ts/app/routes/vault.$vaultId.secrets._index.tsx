import type { Route } from "./+types/vault.$vaultId.secrets._index";
import { Navbar } from "~app/components/navbar";
import { PasswordList } from "~app/components/password-list";
import { SearchBar } from "~app/components/search-bar";

// Note: Parent layout (vault.$vaultId.tsx) handles vault unlock validation
// and redirects to unlock page if needed. No need to duplicate that check here.

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;
  return { vaultId: vaultId! };
}

export default function VaultPasswordsIndex({
  loaderData,
}: Route.ComponentProps) {
  const { vaultId } = loaderData;

  return (
    <>
      <Navbar vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-4">
        <SearchBar placeholder="Search passwords..." />
        <div className="mt-4">
          <PasswordList showDeleted={false} />
        </div>
      </div>
    </>
  );
}
