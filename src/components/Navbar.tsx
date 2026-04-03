import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { logout } from "~/server/rickroll.functions";
import { $icon } from "~/lib/icons";

export function Navbar({ rickrollId }: { rickrollId: number }) {
  async function handleLogout() {
    await logout();
    window.location.href = "/";
  }

  return (
    <nav className="border-border/30 flex items-center justify-between border-b px-6 py-3">
      <a
        href="/home"
        className="flex items-center gap-2 font-sans text-lg font-bold no-underline"
      >
        <img
          src={$icon("/images/rickbait-64.webp")}
          alt="Rickbait"
          className="h-8 w-8"
        />
        <span className="text-foreground">Rickbait</span>
      </a>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="cursor-pointer rounded-full">
            <Avatar>
              <AvatarFallback className="bg-accent/20 text-accent text-sm">
                {rickrollId}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={`/@${rickrollId}`} className="cursor-pointer no-underline">
              Profile
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
