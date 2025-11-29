import { useState } from "react";
import { Link, useNavigate, href } from "react-router";
import { Menu, ArrowLeft } from "lucide-react";
import { Button } from "~app/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~app/components/ui/sheet";
import { useVault } from "~app/contexts/vault-context";
import { UserMenu } from "./user-menu";

interface NavbarProps {
  showBackButton?: boolean;
}

export function Navbar({ showBackButton = false }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { activeVault } = useVault();

  return (
    <>
      <nav className="border-border bg-background sticky top-0 z-40 w-full border-b">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Left: Burger Menu + Optional Back Button */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
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

          {/* Right: Vault Info + Avatar (if unlocked) */}
          <div className="flex items-center gap-2">
            {activeVault && (
              <>
                <Link
                  to={href("/vault/:vaultId/secrets", { vaultId: activeVault.vaultId })}
                  className="text-foreground hover:text-primary font-mono text-sm transition-colors"
                >
                  {activeVault.vaultName}@{activeVault.vaultDomain}
                </Link>
                <UserMenu />
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
              to="/"
              className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              Vaults
            </Link>
            <Link
              to="/generate-password"
              className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              Generate Password
            </Link>
            <Link
              to="/password-memorizer"
              className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              Memorize Password
            </Link>
            <Link
              to="/test-tauri"
              className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              Test Tauri
            </Link>
            <Link
              to="/test-blake3"
              className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              Test Blake3
            </Link>
            <Link
              to="/about"
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
