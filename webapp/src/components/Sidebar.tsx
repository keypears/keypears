import { useState, useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";
import { logout } from "~/server/user.functions";
import {
  clearCachedEncryptionKey,
  clearCachedEntropyTier,
  getCachedEntropyTier,
} from "~/lib/auth";
import { $icon } from "~/lib/icons";
import {
  Inbox,
  Send,
  Lock,
  Menu,
  X,
  CircleUser,
  KeyRound,
  LockKeyhole,
  LogOut,
  User,
} from "lucide-react";

const navItems = [
  { name: "Inbox", path: "/inbox", icon: Inbox },
  { name: "Send", path: "/send", icon: Send },
  { name: "Vault", path: "/vault", icon: Lock },
];

function UserDropdown({ keypearId }: { keypearId: number }) {
  const [tier, setTier] = useState<ReturnType<typeof getCachedEntropyTier>>(null);
  useEffect(() => {
    setTier(getCachedEntropyTier());
  }, []);
  const showWarning = tier === "red" || tier === "yellow";
  const dotColor = tier === "red" ? "bg-destructive" : "bg-yellow-500";

  async function handleLogout() {
    clearCachedEncryptionKey();
    clearCachedEntropyTier();
    await logout();
    window.location.href = "/";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="cursor-pointer rounded-full">
          <CircleUser className="text-muted-foreground h-7 w-7" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={`/@${keypearId}`} className="cursor-pointer no-underline">
            <User className="mr-2 h-4 w-4" />
            Profile
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/keys" className="cursor-pointer no-underline">
            <KeyRound className="mr-2 h-4 w-4" />
            Key Rotation
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href="/password"
            className="cursor-pointer no-underline"
          >
            <LockKeyhole className="mr-2 h-4 w-4" />
            Change Password
            {showWarning && (
              <span
                className={`${dotColor} ml-auto h-2 w-2 rounded-full`}
              />
            )}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavItems({
  onClick,
  hasPassword,
}: {
  onClick?: () => void;
  hasPassword: boolean;
}) {
  const location = useLocation();

  if (!hasPassword) return null;

  return (
    <div className="flex flex-col gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;

        return (
          <a
            key={item.name}
            href={item.path}
            onClick={onClick}
            className={`flex items-center gap-3 rounded px-3 py-2 text-sm no-underline transition-colors ${
              isActive
                ? "bg-accent/10 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/5"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.name}
          </a>
        );
      })}
    </div>
  );
}

function Logo() {
  return (
    <a
      href="/"
      className="flex items-center gap-2 font-sans text-lg font-bold no-underline"
    >
      <img
        src={$icon("/images/keypears-64.webp")}
        alt="KeyPears"
        className="h-8 w-8"
      />
      <span className="text-foreground">KeyPears</span>
    </a>
  );
}

function Address({ keypearId }: { keypearId: number }) {
  return (
    <a
      href={`/@${keypearId}`}
      className="text-muted-foreground hover:text-foreground text-sm no-underline transition-colors"
    >
      {keypearId}@keypears.com
    </a>
  );
}

export function Sidebar({
  keypearId,
  hasPassword,
}: {
  keypearId: number;
  hasPassword: boolean;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <nav className="border-border/30 flex items-center justify-between border-b px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3">
          {hasPassword && (
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          )}
          <Logo />
        </div>
        <div className="flex items-center gap-3">
          <Address keypearId={keypearId} />
          <UserDropdown keypearId={keypearId} />
        </div>
      </nav>

      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-300 ease-in-out lg:hidden dark:bg-black/40 ${
          isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsMenuOpen(false)}
      />

      {/* Mobile drawer */}
      <div
        className={`bg-background border-border/30 fixed top-0 left-0 z-40 flex h-full w-64 transform flex-col border-r p-6 shadow-lg transition-transform duration-300 ease-in-out lg:hidden ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setIsMenuOpen(false)}
          className="text-muted-foreground hover:text-foreground mb-6"
          aria-label="Close menu"
        >
          <X className="h-6 w-6" />
        </button>
        <div className="mb-6">
          <Logo />
        </div>
        <NavItems
          onClick={() => setIsMenuOpen(false)}
          hasPassword={hasPassword}
        />
        <div className="mt-auto">
          <UserDropdown keypearId={keypearId} />
        </div>
      </div>

      {/* Desktop sidebar */}
      {hasPassword && (
        <nav className="border-border/30 bg-background hidden lg:fixed lg:top-0 lg:left-0 lg:flex lg:h-screen lg:w-56 lg:flex-col lg:border-r lg:px-4 lg:pt-8">
          <div className="mb-8">
            <Logo />
          </div>
          <NavItems hasPassword={hasPassword} />
        </nav>
      )}

      {/* Desktop top-right: address + user dropdown */}
      <div className="hidden lg:fixed lg:top-4 lg:right-4 lg:flex lg:items-center lg:gap-3">
        <Address keypearId={keypearId} />
        <UserDropdown keypearId={keypearId} />
      </div>
    </>
  );
}
