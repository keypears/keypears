import type { Route } from "./+types/vault.$vaultId";
import { Outlet, redirect, href } from "react-router";
import {
  isVaultUnlocked,
  getUnlockedVault,
  switchToVault,
} from "~app/lib/vault-store";
import { updateVaultLastAccessed } from "~app/db/models/vault";
import { initDb } from "~app/db";
import { BottomTabBar } from "~app/components/bottom-tab-bar";

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

export default function VaultLayout({ loaderData }: Route.ComponentProps) {
  const { vaultId } = loaderData;

  return (
    <div className="bg-background min-h-screen pb-16">
      <Outlet />
      <BottomTabBar vaultId={vaultId} />
    </div>
  );
}
