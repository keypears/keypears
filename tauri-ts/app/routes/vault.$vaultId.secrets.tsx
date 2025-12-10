import type { Route } from "./+types/vault.$vaultId.secrets";
import { Outlet, redirect, href } from "react-router";
import { isVaultUnlocked, getUnlockedVault, switchToVault } from "~app/lib/vault-store";
import { ServerStatusProvider } from "~app/contexts/ServerStatusContext";
import { ServerStatusBanner } from "~app/components/ServerStatusBanner";
import { buildServerUrl } from "@keypears/api-server/client";
import { updateVaultLastAccessed } from "~app/db/models/vault";
import { initDb } from "~app/db";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;

  if (!vaultId) {
    throw redirect(href("/"));
  }

  // Redirect to unlock page if vault is not unlocked
  if (!isVaultUnlocked(vaultId)) {
    throw redirect(href("/unlock-vault/:vaultId", { vaultId }));
  }

  const vault = getUnlockedVault(vaultId);
  if (!vault) {
    throw redirect(href("/unlock-vault/:vaultId", { vaultId }));
  }

  // Check if we're switching to a different vault
  const didSwitch = switchToVault(vaultId);
  if (didSwitch) {
    // Update last accessed timestamp when switching vaults
    await initDb();
    await updateVaultLastAccessed(vaultId);
  }

  return {
    vaultId,
    vaultDomain: vault.vaultDomain,
  };
}

export default function VaultPasswordsLayout({
  loaderData,
}: Route.ComponentProps) {
  const { vaultDomain } = loaderData;

  return (
    <ServerStatusProvider serverUrl={buildServerUrl(vaultDomain)}>
      <ServerStatusBanner />
      <Outlet />
    </ServerStatusProvider>
  );
}
