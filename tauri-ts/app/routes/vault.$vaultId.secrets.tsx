import type { Route } from "./+types/vault.$vaultId.secrets";
import { Outlet, redirect, href } from "react-router";
import { isVaultUnlocked, getActiveVault } from "~app/lib/vault-store";
import { ServerStatusProvider } from "~app/contexts/ServerStatusContext";
import { ServerStatusBanner } from "~app/components/ServerStatusBanner";
import { buildServerUrl } from "@keypears/api-server/client";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;

  if (!vaultId) {
    throw redirect(href("/"));
  }

  // Redirect to unlock page if vault is not unlocked
  if (!isVaultUnlocked(vaultId)) {
    throw redirect(href("/unlock-vault/:vaultId", { vaultId }));
  }

  const activeVault = getActiveVault();
  if (!activeVault) {
    throw redirect(href("/unlock-vault/:vaultId", { vaultId }));
  }

  return {
    vaultId,
    vaultDomain: activeVault.vaultDomain,
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
