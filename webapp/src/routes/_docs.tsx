import { useState } from "react";
import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSessionUserId } from "~/server/session";
import { UserDropdown } from "~/components/UserDropdown";
import { $icon } from "~/lib/icons";
import {
  Home,
  BookOpen,
  FileText,
  KeyRound,
  Shield,
  Cpu,
  Globe,
  Server,
  Code,
  Menu,
  X,
} from "lucide-react";

// Optional auth — returns user info if logged in, null if not
const getDocsUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getUserById } = await import("~/server/user.server");
  const userId = await getSessionUserId();
  if (!userId) return null;
  const user = await getUserById(userId);
  if (!user) return null;
  return {
    name: user.name,
    hasPassword: !!user.passwordHash,
    domain: null as string | null, // would need domain lookup for full address
  };
});

export const Route = createFileRoute("/_docs")({
  loader: () => getDocsUser(),
  component: DocsLayout,
});

const docsNav = [
  { name: "Welcome", path: "/docs", icon: BookOpen },
  { name: "Addressing", path: "/docs/protocol/addressing", icon: FileText },
  { name: "Key Derivation", path: "/docs/protocol/key-derivation", icon: KeyRound },
  { name: "Encryption", path: "/docs/protocol/encryption", icon: Shield },
  { name: "Proof of Work", path: "/docs/protocol/proof-of-work", icon: Cpu },
  { name: "Federation", path: "/docs/federation", icon: Globe },
  { name: "Self-Hosting", path: "/docs/self-hosting", icon: Server },
  { name: "Security", path: "/docs/security", icon: Shield },
  { name: "Development", path: "/docs/development", icon: Code },
];

function DocsLayout() {
  const user = Route.useLoaderData();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  function NavList({ onSelect }: { onSelect?: () => void }) {
    return (
      <div className="flex flex-col">
        <Link
          to={user?.hasPassword ? "/home" : "/"}
          onClick={onSelect}
          className="text-muted-foreground hover:text-foreground flex items-center gap-2 px-4 py-3 text-sm no-underline transition-colors"
        >
          <Home className="h-4 w-4" />
          Home
        </Link>
        <div className="border-border/30 border-t" />
        <div className="px-4 pt-3 pb-1">
          <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
            Documentation
          </span>
        </div>
        {docsNav.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onSelect}
              className={`flex items-center gap-2 px-4 py-2 text-sm no-underline transition-colors ${
                active
                  ? "bg-accent/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/5"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex font-sans">
      {/* Desktop sidebar */}
      <div className="bg-background border-border/30 hidden w-64 flex-col border-r lg:flex">
        <div className="border-border/30 flex items-center gap-2 border-b px-4 py-3">
          <Link to="/docs" className="flex items-center gap-2 no-underline">
            <picture>
              <source
                srcSet={`${$icon("/images/keypears-dark-64.webp")} 1x, ${$icon("/images/keypears-dark-128.webp")} 2x`}
                media="(prefers-color-scheme: dark)"
              />
              <img
                src={$icon("/images/keypears-light-64.webp")}
                srcSet={`${$icon("/images/keypears-light-64.webp")} 1x, ${$icon("/images/keypears-light-128.webp")} 2x`}
                alt="KeyPears"
                className="h-6 w-6"
              />
            </picture>
            <span className="text-foreground text-sm font-bold">Docs</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList />
        </div>
      </div>

      {/* Mobile drawer backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-300 ease-in-out lg:hidden dark:bg-black/40 ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Mobile drawer */}
      <div
        className={`bg-background border-border/30 fixed top-0 left-0 z-40 flex h-full w-64 transform flex-col border-r shadow-lg transition-transform duration-300 ease-in-out lg:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-border/30 flex items-center gap-2 border-b px-4 py-3">
          <button
            onClick={() => setDrawerOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="text-foreground text-sm font-bold">Docs</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList onSelect={() => setDrawerOpen(false)} />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-background border-border/30 flex items-center gap-3 border-b px-4 py-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-muted-foreground hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-foreground text-sm font-medium lg:hidden">
            Docs
          </span>
          <div className="flex-1" />
          {user?.name && (
            <span className="text-muted-foreground text-sm">
              {user.name}
            </span>
          )}
          {user?.name && (
            <UserDropdown
              userName={user.name}
              domain={user.domain}
              hasPassword={user.hasPassword}
            />
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
            <Outlet />

            {/* Footer */}
            <footer className="border-border/30 mt-12 border-t pt-4 pb-6">
              <div className="flex justify-center">
                <a
                  href="https://astrohacker.com"
                  className="text-muted-foreground hover:text-accent flex items-center gap-2 text-xs no-underline"
                >
                  <picture>
                    <source
                      srcSet="/images/astrohacker-6-dark-32.webp 1x, /images/astrohacker-6-dark-64.webp 2x"
                      media="(prefers-color-scheme: dark)"
                    />
                    <img
                      src="/images/astrohacker-6-light-32.webp"
                      srcSet="/images/astrohacker-6-light-32.webp 1x, /images/astrohacker-6-light-64.webp 2x"
                      alt="Astrohacker logo"
                      className="h-5 w-5"
                    />
                  </picture>
                  An Astrohacker Project
                </a>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
