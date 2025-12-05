import { useState, useEffect } from "react";
import { User, Lock, Activity } from "lucide-react";
import { useNavigate, Link, href } from "react-router";
import { Button } from "~app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~app/components/ui/dropdown-menu";
import {
  getActiveVault,
  getSessionToken,
  clearActiveVault,
  clearSession,
  type UnlockedVault,
} from "~app/lib/vault-store";
import { useSyncState } from "~app/contexts/sync-context";
import { createApiClient } from "~app/lib/api-client";
import { stopBackgroundSync } from "~app/lib/sync-service";

// Poll interval for checking vault state
const VAULT_POLL_INTERVAL = 500; // 500ms

export function UserMenu() {
  const navigate = useNavigate();
  const { unreadCount } = useSyncState();
  const [activeVault, setActiveVault] = useState<UnlockedVault | null>(() =>
    getActiveVault()
  );

  // Poll vault-store for state changes (handles lock/unlock without React context)
  useEffect(() => {
    const interval = setInterval(() => {
      const currentVault = getActiveVault();
      setActiveVault(currentVault);
    }, VAULT_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, []);

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

      // Step 2: Stop background sync
      stopBackgroundSync();

      // Step 3: Clear session and vault from memory
      clearSession();
      clearActiveVault();

      // Step 4: Navigate to home
      navigate("/", { replace: true });
    } catch (err) {
      console.error("Error during logout:", err);
      // Even if logout fails, still lock vault locally for security
      stopBackgroundSync();
      clearSession();
      clearActiveVault();
      navigate("/", { replace: true });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="User menu" className="relative">
          <User size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 border-2 border-background" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link to={href("/vault/:vaultId/secrets", { vaultId: activeVault.vaultId })}>
            {activeVault.vaultName}@{activeVault.vaultDomain}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={href("/vault/:vaultId/sync", { vaultId: activeVault.vaultId })} className="flex items-center">
            <Activity size={16} className="mr-2" />
            Sync Activity
            {unreadCount > 0 && (
              <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLockVault}>
          <Lock size={16} className="mr-2" />
          Lock Vault
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
