import { NavLink, href } from "react-router";
import { Key, MessageSquare } from "lucide-react";
import { cn } from "~app/lib/utils";

interface BottomTabBarProps {
  vaultId: string;
}

export function BottomTabBar({ vaultId }: BottomTabBarProps) {
  return (
    <nav className="bg-card border-border fixed right-0 bottom-0 left-0 z-50 border-t">
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-around">
        <NavLink
          to={href("/vault/:vaultId/secrets", { vaultId })}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-2 transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )
          }
        >
          <Key size={24} />
          <span className="text-xs font-medium">Passwords</span>
        </NavLink>
        <NavLink
          to={href("/vault/:vaultId/messages", { vaultId })}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-2 transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )
          }
        >
          <MessageSquare size={24} />
          <span className="text-xs font-medium">Messages</span>
        </NavLink>
      </div>
    </nav>
  );
}
