import type { MetaFunction } from "react-router";
import type { Route } from "./+types/unlock-vault.$vaultId";
import { useState } from "react";
import { redirect, useNavigate } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Button } from "~app/components/ui/button";
import { Input } from "~app/components/ui/input";
import { calculatePasswordEntropy } from "@keypears/lib";
import { cn } from "~app/lib/utils";
import { getVault } from "~app/db/models/vault";
import { verifyVaultPassword } from "~app/lib/vault-crypto";
import { useVault } from "~app/contexts/vault-context";
import { isVaultUnlocked } from "~app/lib/vault-session";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;

  if (!vaultId) {
    throw redirect("/");
  }

  // Check if vault is already unlocked
  if (isVaultUnlocked(vaultId)) {
    // Redirect to vault's password page
    throw redirect(`/vault/${vaultId}/passwords`);
  }

  // Load vault data
  const vault = await getVault(vaultId);
  if (!vault) {
    throw redirect("/");
  }

  return { vault };
}

export default function UnlockVault({ loaderData }: Route.ComponentProps) {
  const { unlockVault } = useVault();
  const navigate = useNavigate();

  const vault = loaderData.vault;
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  const entropy =
    password.length > 0
      ? calculatePasswordEntropy(password.length, {
          lowercase: /[a-z]/.test(password),
          uppercase: /[A-Z]/.test(password),
          numbers: /[0-9]/.test(password),
          symbols: /[^a-zA-Z0-9]/.test(password),
        })
      : 0;

  const isValid = password.length > 0;

  const handleUnlock = async () => {
    if (!isValid) return;

    setIsUnlocking(true);
    setError("");

    try {
      const result = verifyVaultPassword(
        password,
        vault.encryptedVaultKey,
        vault.hashedVaultKey,
      );

      if (result.valid && result.passwordKey) {
        // Password is correct - unlock vault
        unlockVault(
          vault.id,
          vault.name,
          result.passwordKey,
          vault.encryptedVaultKey,
        );
        navigate(`/vault/${vault.id}/passwords`);
      } else {
        // Password is incorrect
        setError("Incorrect password");
        setPassword("");
      }
    } catch (err) {
      console.error("Error unlocking vault:", err);
      setError("Failed to unlock vault");
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="bg-background min-h-screen">
      <Navbar showBackButton />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="border-border bg-card rounded-lg border p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Unlock Vault</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Vault: <span className="font-mono">{vault.name}@localhost</span>
            </p>
          </div>

          <div className="mb-6">
            <h2 className="mb-4 text-lg font-semibold">Enter your password</h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && isValid) {
                        handleUnlock();
                      }
                    }}
                    placeholder="Enter your password"
                    className={error ? "border-destructive pr-10" : "pr-10"}
                    autoFocus
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    {password.length} characters
                  </span>
                  {password.length > 0 && (
                    <span
                      className={cn(
                        entropy >= 75 && "text-green-500",
                        entropy >= 50 && entropy < 75 && "text-yellow-500",
                        entropy < 50 && "text-destructive",
                      )}
                    >
                      {entropy.toFixed(1)} bits entropy
                    </span>
                  )}
                </div>
                {error && <p className="text-destructive text-xs">{error}</p>}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handleUnlock}
              disabled={!isValid || isUnlocking}
            >
              {isUnlocking ? "Unlocking..." : "Unlock Vault"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [
    { title: "Unlock Vault | KeyPears" },
    { name: "description", content: "Unlock your vault" },
  ];
};
