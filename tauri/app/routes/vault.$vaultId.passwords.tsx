import type { MetaFunction } from "react-router";
import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { Key } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { useVault } from "~app/contexts/vault-context";

export default function VaultPasswords() {
  const params = useParams();
  const navigate = useNavigate();
  const { activeVault } = useVault();

  // Redirect to unlock page if vault is not unlocked
  useEffect(() => {
    if (!activeVault || activeVault.vaultId !== params.vaultId) {
      navigate(`/unlock-vault/${params.vaultId}`);
    }
  }, [activeVault, params.vaultId, navigate]);

  if (!activeVault || activeVault.vaultId !== params.vaultId) {
    return null;
  }

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="border-border bg-card rounded-lg border p-8">
          <div className="flex flex-col items-center text-center">
            <div className="bg-primary/10 mb-4 rounded-full p-4">
              <Key className="text-primary h-8 w-8" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">Passwords</h2>
            <p className="text-muted-foreground text-sm">
              Password management functionality coming soon
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [
    { title: "Passwords | KeyPears" },
    { name: "description", content: "Manage your passwords" },
  ];
};
