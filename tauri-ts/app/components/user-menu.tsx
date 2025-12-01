import { User, Lock } from "lucide-react";
import { useNavigate, Link, href } from "react-router";
import { Button } from "~app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~app/components/ui/dropdown-menu";
import { useVault } from "~app/contexts/vault-context";
import { createApiClient } from "~app/lib/api-client";

export function UserMenu() {
  const navigate = useNavigate();
  const { activeVault, lockVault, getSessionToken, clearSession } = useVault();

  if (!activeVault) {
    return null;
  }

  const handleLockVault = async () => {
    try {
      // Step 1: Call /api/logout to invalidate session on server
      const sessionToken = getSessionToken();
      if (sessionToken) {
        const apiClient = await createApiClient(activeVault.vaultDomain, sessionToken);
        await apiClient.api.logout({ sessionToken });
      }

      // Step 2: Clear session from memory
      clearSession();

      // Step 3: Lock vault (clears keys from memory, stops background sync)
      lockVault();

      // Step 4: Navigate to home
      navigate("/", { replace: true });
    } catch (err) {
      console.error("Error during logout:", err);
      // Even if logout fails, still lock vault locally for security
      clearSession();
      lockVault();
      navigate("/", { replace: true });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="User menu">
          <User size={20} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link to={href("/vault/:vaultId/secrets", { vaultId: activeVault.vaultId })}>
            {activeVault.vaultName}@{activeVault.vaultDomain}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLockVault}>
          <Lock size={16} className="mr-2" />
          Lock Vault
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
