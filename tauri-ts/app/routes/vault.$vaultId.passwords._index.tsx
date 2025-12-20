import type { Route } from "./+types/vault.$vaultId.passwords._index";
import { Navbar } from "~app/components/navbar";
import { PasswordList } from "~app/components/password-list";
import type { DecryptedSecret } from "~app/components/password-list";
import { SearchBar } from "~app/components/search-bar";
import { getAllCurrentSecrets } from "~app/db/models/password";
import { getVaultKey } from "~app/lib/vault-store";
import { decryptSecretUpdateBlob } from "~app/lib/secret-encryption";

// Note: Parent layout (vault.$vaultId.tsx) handles vault unlock validation
// and redirects to unlock page if needed. No need to duplicate that check here.

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId!;

  // Load and decrypt passwords in the loader
  const vaultKey = getVaultKey(vaultId);
  const currentSecrets = await getAllCurrentSecrets(vaultId, {
    excludeTypes: ["message"],
  });

  // Decrypt blobs for display (domain, username, etc.)
  const passwords: DecryptedSecret[] = currentSecrets.map((secret) => ({
    ...secret,
    decryptedBlob: decryptSecretUpdateBlob(secret.encryptedBlob, vaultKey),
  }));

  return { vaultId, passwords };
}

export default function VaultPasswordsIndex({
  loaderData,
}: Route.ComponentProps) {
  const { vaultId, passwords } = loaderData;

  return (
    <>
      <Navbar vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-4">
        <SearchBar placeholder="Search passwords..." />
        <div className="mt-4">
          <PasswordList passwords={passwords} showDeleted={false} />
        </div>
      </div>
    </>
  );
}
