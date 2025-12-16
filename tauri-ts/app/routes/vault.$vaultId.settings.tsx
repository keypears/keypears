import type { Route } from "./+types/vault.$vaultId.settings";
import { useState } from "react";
import { Settings } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { Label } from "~app/components/ui/label";
import { createClientFromDomain } from "@keypears/api-server/client";
import { getUnlockedVault, getSessionToken } from "~app/lib/vault-store";
import type { VaultSettings } from "@keypears/api-server";

// Default difficulty is ~4 million (2^22 = 4,194,304) - same as registration
const DEFAULT_DIFFICULTY = "4194304";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;

  const vault = getUnlockedVault(vaultId);
  if (!vault) {
    throw new Response("Vault not unlocked", { status: 401 });
  }

  const sessionToken = getSessionToken(vaultId);
  if (!sessionToken) {
    throw new Response("No session", { status: 401 });
  }

  const client = await createClientFromDomain(vault.vaultDomain, {
    sessionToken,
  });

  const response = await client.api.getVaultSettings({
    vaultId,
  });

  return {
    vaultId,
    vaultDomain: vault.vaultDomain,
    settings: response.settings,
  };
}

export default function VaultSettingsPage({
  loaderData,
}: Route.ComponentProps) {
  const { vaultId, vaultDomain, settings: initialSettings } = loaderData;

  const [settings, setSettings] = useState<VaultSettings>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Convert difficulty string to display value
  const displayDifficulty =
    settings.messagingMinDifficulty || DEFAULT_DIFFICULTY;

  const handleDifficultyChange = (value: string) => {
    // Only allow numeric input
    const numericValue = value.replace(/[^0-9]/g, "");
    setSettings((prev) => ({
      ...prev,
      messagingMinDifficulty: numericValue || undefined,
    }));
    setSuccess(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const sessionToken = getSessionToken(vaultId);
      if (!sessionToken) {
        throw new Error("No session token available");
      }

      const client = await createClientFromDomain(vaultDomain, {
        sessionToken,
      });

      const response = await client.api.updateVaultSettings({
        vaultId,
        settings,
      });

      setSettings(response.settings);
      setSuccess(true);
    } catch (err) {
      console.error("Error saving settings:", err);
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSettings((prev) => ({
      ...prev,
      messagingMinDifficulty: undefined,
    }));
    setSuccess(false);
  };

  // Format number with commas for display
  const formatNumber = (num: string): string => {
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  return (
    <div className="bg-background min-h-screen">
      <Navbar vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <Settings size={24} className="text-primary" />
            <h1 className="text-2xl font-bold">Vault Settings</h1>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            Configure your vault preferences and messaging settings.
          </p>
        </div>

        {error && (
          <div className="border-destructive/50 bg-destructive/10 mb-4 rounded-lg border p-4">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="border-primary/50 bg-primary/10 mb-4 rounded-lg border p-4">
            <p className="text-primary text-sm">Settings saved successfully.</p>
          </div>
        )}

        {/* Messaging Settings Card */}
        <div className="border-border bg-card rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">Messaging</h2>

          <div className="space-y-4">
            <div>
              <Label htmlFor="difficulty" className="text-sm font-medium">
                Minimum Message Difficulty
              </Label>
              <p className="text-muted-foreground mb-2 text-xs">
                Higher values require senders to spend more computation time
                before messaging you. This helps prevent spam.
              </p>
              <div className="flex items-center gap-3">
                <Input
                  id="difficulty"
                  type="text"
                  value={displayDifficulty}
                  onChange={(e) => handleDifficultyChange(e.target.value)}
                  className="font-mono"
                  placeholder={DEFAULT_DIFFICULTY}
                />
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Reset
                </Button>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                Default: {formatNumber(DEFAULT_DIFFICULTY)} (~4 seconds on GPU)
              </p>
            </div>
          </div>

          <div className="border-border mt-6 flex justify-end border-t pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
