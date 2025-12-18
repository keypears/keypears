import type { Route } from "./+types/vault.$vaultId.passwords";
import { Outlet } from "react-router";
import { getUnlockedVault } from "~app/lib/vault-store";
import { ServerStatusProvider } from "~app/contexts/ServerStatusContext";
import { ServerStatusBanner } from "~app/components/ServerStatusBanner";
import { buildServerUrl } from "@keypears/api-server/client";

// Note: Parent layout (vault.$vaultId.tsx) handles vault unlock validation
// and redirects to unlock page if needed. No need to duplicate that check here.

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;
  const vault = getUnlockedVault(vaultId!);

  return {
    vaultDomain: vault?.vaultDomain ?? "",
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
