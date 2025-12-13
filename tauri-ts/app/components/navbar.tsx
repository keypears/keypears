import { useState } from "react";
import { Link, useNavigate, href } from "react-router";
import { Menu, Home, ArrowLeft } from "lucide-react";
import { Button } from "~app/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~app/components/ui/sheet";
import { getUnlockedVault } from "~app/lib/vault-store";
import { UserMenu } from "./user-menu";

interface NavbarProps {
  showBackButton?: boolean;
  /**
   * If provided, shows the vault info and user menu in the navbar.
   * Only pass this when on a vault sub-page (e.g., /vault/:vaultId/secrets).
   */
  vaultId?: string;
}

export function Navbar({ showBackButton = false, vaultId }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Get vault info if vaultId is provided and vault is unlocked
  const vault = vaultId ? getUnlockedVault(vaultId) : null;

  return (
    <>
      <nav className="border-border bg-background sticky top-0 z-40 w-full border-b">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Left: Burger Menu + Home + Optional Back Button */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link to={href("/")} aria-label="Go home">
                <Home size={20} />
              </Link>
            </Button>
            {showBackButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                aria-label="Go back"
              >
                <ArrowLeft size={20} />
              </Button>
            )}
          </div>

          {/* Right: Vault Info + User Menu (only if on a vault page with unlocked vault) */}
          <div className="flex items-center gap-2">
            {vault && vaultId && (
              <>
                <Link
                  to={href("/vault/:vaultId/secrets", {
                    vaultId: vault.vaultId,
                  })}
                  className="text-foreground hover:text-primary font-mono text-sm transition-colors"
                >
                  {vault.vaultName}@{vault.vaultDomain}
                </Link>
                <UserMenu vaultId={vaultId} />
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Slide-out menu */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-2">
            <Link
              to={href("/")}
              className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              Vaults
            </Link>
            <Link
              to={href("/generate-password")}
              className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              Generate Password
            </Link>
            <Link
              to={href("/password-memorizer")}
              className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              Memorize Password
            </Link>
            <Link
              to={href("/test-tauri")}
              className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              Test Tauri
            </Link>
            <Link
              to={href("/test-pow5")}
              className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              Test Pow5
            </Link>
            <Link
              to={href("/about")}
              className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              About
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
