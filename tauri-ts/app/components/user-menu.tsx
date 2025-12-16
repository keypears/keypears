import { User, Lock, Activity, Key, Settings } from "lucide-react";
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
  getUnlockedVault,
  getSessionToken,
  lockVault,
} from "~app/lib/vault-store";
import { useUnreadCount, clearSyncState } from "~app/contexts/sync-context";
import { createClientFromDomain } from "@keypears/api-server/client";
import { stopBackgroundSync } from "~app/lib/sync-service";

interface UserMenuProps {
  vaultId: string;
}

export function UserMenu({ vaultId }: UserMenuProps) {
  const navigate = useNavigate();
  const unreadCount = useUnreadCount(vaultId);

  // Get vault info
  const vault = getUnlockedVault(vaultId);

  if (!vault) {
    return null;
  }

  const handleLockVault = async () => {
    try {
      // Step 1: Call /api/logout to invalidate session on server
      const sessionToken = getSessionToken(vaultId);
      if (sessionToken) {
        const apiClient = await createClientFromDomain(vault.vaultDomain, {
          sessionToken,
        });
        await apiClient.api.logout({ sessionToken });
      }

      // Step 2: Stop background sync for this vault
      stopBackgroundSync(vaultId);

      // Step 3: Clear sync state for this vault
      clearSyncState(vaultId);

      // Step 4: Lock this vault (removes from memory)
      lockVault(vaultId);

      // Step 5: Navigate to home
      navigate("/", { replace: true });
    } catch (err) {
      console.error("Error during logout:", err);
      // Even if logout fails, still lock vault locally for security
      stopBackgroundSync(vaultId);
      clearSyncState(vaultId);
      lockVault(vaultId);
      navigate("/", { replace: true });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="User menu"
          className="relative"
        >
          <User size={20} />
          {unreadCount > 0 && (
            <span className="border-background absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 bg-red-500" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link to={href("/vault/:vaultId/secrets", { vaultId })}>
            {vault.vaultName}@{vault.vaultDomain}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to={href("/vault/:vaultId/derived-keys", { vaultId })}
            className="flex items-center"
          >
            <Key size={16} className="mr-2" />
            Derived Keys
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to={href("/vault/:vaultId/sync", { vaultId })}
            className="flex items-center"
          >
            <Activity size={16} className="mr-2" />
            Sync Activity
            {unreadCount > 0 && (
              <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to={href("/vault/:vaultId/settings", { vaultId })}
            className="flex items-center"
          >
            <Settings size={16} className="mr-2" />
            Settings
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
