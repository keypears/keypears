import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpen,
  KeyRound,
  Shield,
  Globe,
  Server,
  Code,
  FileText,
  Cpu,
  Menu,
  X,
} from "lucide-react";

interface NavItem {
  name: string;
  path: string;
  icon: typeof BookOpen;
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [{ name: "Welcome", path: "/docs", icon: BookOpen }],
  },
  {
    title: "Protocol",
    items: [
      { name: "Addressing", path: "/docs/protocol/addressing", icon: FileText },
      { name: "Key Derivation", path: "/docs/protocol/key-derivation", icon: KeyRound },
      { name: "Encryption", path: "/docs/protocol/encryption", icon: Shield },
      { name: "Proof of Work", path: "/docs/protocol/proof-of-work", icon: Cpu },
    ],
  },
  {
    items: [
      { name: "Federation", path: "/docs/federation", icon: Globe },
      { name: "Self-Hosting", path: "/docs/self-hosting", icon: Server },
      { name: "Security", path: "/docs/security", icon: Shield },
      { name: "Development", path: "/docs/development", icon: Code },
    ],
  },
];

export function DocsSidebar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const sidebar = (
    <nav className="flex flex-col gap-4 p-4 text-sm">
      {navGroups.map((group) => (
        <div key={group.title || group.items[0]?.path}>
          {group.title && (
            <h3 className="text-foreground mb-1 px-2 text-xs font-bold uppercase tracking-wider">
              {group.title}
            </h3>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 no-underline transition-colors ${
                      active
                        ? "bg-accent/15 text-accent font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="text-muted-foreground hover:text-foreground fixed bottom-4 right-4 z-30 rounded-full bg-background-dark p-3 shadow-lg md:hidden"
        aria-label="Toggle docs menu"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="bg-background/80 fixed inset-0 z-20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`border-border/30 shrink-0 border-r ${
          open
            ? "bg-background fixed inset-y-0 left-0 z-20 w-64 overflow-y-auto"
            : "hidden w-56 md:block"
        }`}
      >
        <div className="sticky top-0 overflow-y-auto">
          {sidebar}
        </div>
      </aside>
    </>
  );
}
