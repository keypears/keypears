import type { Route } from "./+types/vault.$vaultId.settings";
import { useState } from "react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { Label } from "~app/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~app/components/ui/alert-dialog";
import { createClientFromDomain } from "@keypears/api-server/client";
import { estimatePowTime } from "@keypears/lib";
import { getUnlockedVault, getSessionToken } from "~app/lib/vault-store";
import type { VaultSettings } from "@keypears/api-server";

// Difficulty presets
const DIFFICULTY_PRESETS = [
  { label: "Default", value: null, description: "System default (~4M hashes)" },
  { label: "Easy", value: 4_000_000, description: "~4 seconds on GPU" },
  { label: "Medium", value: 40_000_000, description: "~40 seconds on GPU" },
  { label: "Hard", value: 400_000_000, description: "~6 minutes on GPU" },
] as const;

// Minimum difficulty users can set
const MIN_USER_DIFFICULTY = 256;

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

  // Custom difficulty dialog state
  const [isCustomDialogOpen, setIsCustomDialogOpen] = useState(false);
  const [customDifficultyInput, setCustomDifficultyInput] = useState("");
  const [customDifficultyError, setCustomDifficultyError] = useState<string | null>(null);

  // Get the current difficulty value for comparison
  const currentDifficulty = settings.messagingMinDifficulty ?? null;

  // Check if current value matches a preset (by value)
  const isPresetSelected = (presetValue: number | null): boolean => {
    return currentDifficulty === presetValue;
  };

  // Check if current value is custom (not matching any preset)
  const isCustomValue = (): boolean => {
    if (currentDifficulty === null) return false;
    return !DIFFICULTY_PRESETS.some((p) => p.value === currentDifficulty);
  };

  const handlePresetSelect = async (value: number | null) => {
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

      const newSettings: VaultSettings = {
        ...settings,
        messagingMinDifficulty: value ?? undefined,
      };

      const response = await client.api.updateVaultSettings({
        vaultId,
        settings: newSettings,
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

  const handleCustomDialogOpen = () => {
    setCustomDifficultyInput(currentDifficulty?.toString() ?? "");
    setCustomDifficultyError(null);
    setIsCustomDialogOpen(true);
  };

  const handleCustomDifficultySubmit = async () => {
    // Validate input
    const trimmed = customDifficultyInput.trim();
    if (!trimmed) {
      setCustomDifficultyError("Please enter a difficulty value");
      return;
    }

    const parsed = parseInt(trimmed, 10);
    if (isNaN(parsed) || parsed < MIN_USER_DIFFICULTY) {
      setCustomDifficultyError(`Minimum difficulty is ${MIN_USER_DIFFICULTY}`);
      return;
    }

    setIsCustomDialogOpen(false);
    await handlePresetSelect(parsed);
  };

  // Format number with commas for display
  const formatNumber = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  return (
    <div className="bg-background min-h-screen">
      <Navbar vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3">
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
              <Label className="text-sm font-medium">
                Minimum Message Difficulty
              </Label>
              <p className="text-muted-foreground mb-3 text-xs">
                Higher values require senders to spend more computation time
                before messaging you. This helps prevent spam.
              </p>

              {/* Preset buttons */}
              <div className="flex flex-wrap gap-2">
                {DIFFICULTY_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    variant={isPresetSelected(preset.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePresetSelect(preset.value)}
                    disabled={isSaving}
                    className="min-w-[80px]"
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button
                  variant={isCustomValue() ? "default" : "outline"}
                  size="sm"
                  onClick={handleCustomDialogOpen}
                  disabled={isSaving}
                  className="min-w-[80px]"
                >
                  Custom
                </Button>
              </div>

              {/* Current value info */}
              <div className="mt-3 space-y-1">
                <p className="text-muted-foreground text-xs">
                  Current: {currentDifficulty ? formatNumber(currentDifficulty) : "System default"}{" "}
                  {currentDifficulty && `(${estimatePowTime(BigInt(currentDifficulty)).timeGpu} on GPU)`}
                </p>
                {isCustomValue() && currentDifficulty && (
                  <p className="text-muted-foreground text-xs">
                    Custom value: {formatNumber(currentDifficulty)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom difficulty dialog */}
      <AlertDialog open={isCustomDialogOpen} onOpenChange={setIsCustomDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set Custom Difficulty</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a custom difficulty value. Higher values require more
              computation from senders. Minimum: {MIN_USER_DIFFICULTY}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              type="text"
              value={customDifficultyInput}
              onChange={(e) => {
                setCustomDifficultyInput(e.target.value.replace(/[^0-9]/g, ""));
                setCustomDifficultyError(null);
              }}
              placeholder="e.g., 10000000"
              className="font-mono"
            />
            {customDifficultyError && (
              <p className="text-destructive mt-2 text-sm">{customDifficultyError}</p>
            )}
            {customDifficultyInput && !customDifficultyError && (
              <p className="text-muted-foreground mt-2 text-sm">
                Estimated time: {estimatePowTime(customDifficultyInput).timeGpu} on GPU
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCustomDifficultySubmit}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
