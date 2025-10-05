import { User, Lock } from "lucide-react";
import { useNavigate, Link } from "react-router";
import { Button } from "~app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~app/components/ui/dropdown-menu";
import { useVault } from "~app/contexts/vault-context";

export function UserMenu() {
  const navigate = useNavigate();
  const { activeVault, lockVault } = useVault();

  if (!activeVault) {
    return null;
  }

  const handleLockVault = () => {
    lockVault();
    navigate("/", { replace: true });
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
          <Link to={`/vault/${activeVault.vaultId}/passwords`}>
            {activeVault.vaultName}@localhost
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
