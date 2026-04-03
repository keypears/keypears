import type { Route } from "./+types/vault.$vaultId.passwords.deleted";
import { redirect, href } from "react-router";
import { isVaultUnlocked, getVaultKey } from "~app/lib/vault-store";
import { Navbar } from "~app/components/navbar";
import { Breadcrumbs } from "~app/components/breadcrumbs";
import { PasswordList } from "~app/components/password-list";
import type { DecryptedSecret } from "~app/components/password-list";
import { getAllCurrentSecrets } from "~app/db/models/password";
import { decryptSecretUpdateBlob } from "~app/lib/secret-encryption";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;

  if (!vaultId || !isVaultUnlocked(vaultId)) {
    throw redirect(href("/"));
  }

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

export default function VaultPasswordsDeleted({
  loaderData,
}: Route.ComponentProps) {
  const { vaultId, passwords } = loaderData;

  return (
    <div className="bg-background min-h-screen">
      <Navbar showBackButton vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Breadcrumbs vaultId={vaultId} currentPage="Deleted" />
        <PasswordList passwords={passwords} showDeleted={true} />
      </div>
    </div>
  );
}
