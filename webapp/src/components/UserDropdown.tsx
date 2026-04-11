import { Link } from "@tanstack/react-router";
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
import {
  CircleUser,
  KeyRound,
  LockKeyhole,
  LogOut,
  User,
  Globe,
  Settings,
} from "lucide-react";

export function UserDropdown({
  userName,
  domain,
  hasPassword = true,
}: {
  userName: string;
  domain: string | null;
  hasPassword?: boolean;
}) {
  const tier = getCachedEntropyTier();
  const showWarning = tier === "red" || tier === "yellow";
  const dotColor = tier === "red" ? "bg-destructive" : "bg-yellow-500";

  async function handleLogout() {
    clearCachedEncryptionKey();
    clearCachedEntropyTier();
    await logout();
    window.location.href = "/";
  }

  const profilePath = domain ? `/${userName}@${domain}` : `/${userName}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="cursor-pointer rounded-full">
          <CircleUser className="text-muted-foreground h-7 w-7" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasPassword && (
          <>
            <DropdownMenuItem asChild>
              <Link to={profilePath} className="cursor-pointer no-underline">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/keys" className="cursor-pointer no-underline">
                <KeyRound className="mr-2 h-4 w-4" />
                Keys
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/domains" className="cursor-pointer no-underline">
                <Globe className="mr-2 h-4 w-4" />
                Domains
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings" className="cursor-pointer no-underline">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/password" className="cursor-pointer no-underline">
                <LockKeyhole className="mr-2 h-4 w-4" />
                Password
                {showWarning && (
                  <span
                    className={`${dotColor} ml-auto h-2 w-2 rounded-full`}
                  />
                )}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
