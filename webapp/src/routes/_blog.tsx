import { useState } from "react";
import {
  createFileRoute,
  Outlet,
  Link,
  useLocation,
} from "@tanstack/react-router";
import { getMyUser } from "~/server/user.functions";
import { getBlogPosts } from "~/server/blog.functions";
import { UserDropdown } from "~/components/UserDropdown";
import { $icon } from "~/lib/icons";
import type { BlogPostSummary } from "~/lib/blog";
import { Home, Menu, X } from "lucide-react";

export const Route = createFileRoute("/_blog")({
  loader: async () => {
    const [user, posts] = await Promise.all([getMyUser(), getBlogPosts()]);
    return { user, posts };
  },
  component: BlogLayout,
});

function BlogLayout() {
  const { user, posts } = Route.useLoaderData();
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
          <Link
            to="/blog"
            onClick={onSelect}
            className="text-muted-foreground text-xs font-bold uppercase tracking-wider no-underline"
          >
            Blog
          </Link>
        </div>
        {(posts as BlogPostSummary[]).map((post) => {
          const active = location.pathname === `/blog/${post.slug}`;
          return (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              onClick={onSelect}
              className={`px-4 py-2 text-sm no-underline transition-colors ${
                active
                  ? "bg-accent/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/5"
              }`}
            >
              <span className="line-clamp-1">{post.title}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex font-sans">
      {/* Desktop sidebar */}
      <nav className="border-border/30 bg-background hidden lg:fixed lg:top-0 lg:left-0 lg:flex lg:h-screen lg:w-56 lg:flex-col lg:border-r lg:px-4 lg:pt-8">
        <div className="mb-8">
          <Link
            to="/"
            className="flex items-center gap-2 font-sans text-lg font-bold no-underline"
          >
            <picture>
              <source
                srcSet={`${$icon("/images/keypears-dark-64.webp")} 1x, ${$icon("/images/keypears-dark-128.webp")} 2x`}
                media="(prefers-color-scheme: dark)"
              />
              <img
                src={$icon("/images/keypears-light-64.webp")}
                srcSet={`${$icon("/images/keypears-light-64.webp")} 1x, ${$icon("/images/keypears-light-128.webp")} 2x`}
                alt="KeyPears"
                className="h-8 w-8"
              />
            </picture>
            <span className="text-foreground">KeyPears</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList />
        </div>
      </nav>

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
          <span className="text-foreground text-sm font-bold">Blog</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList onSelect={() => setDrawerOpen(false)} />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden lg:ml-56">
        {/* Mobile header */}
        <div className="bg-background border-border/30 flex items-center gap-3 border-b px-4 py-3 lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-foreground text-sm font-medium">Blog</span>
          <div className="flex-1" />
          {user?.name && (
            <UserDropdown
              userName={user.name}
              domain={user.domain}
              hasPassword={user.hasPassword}
            />
          )}
        </div>

        {/* Desktop top-right: address + user dropdown */}
        <div className="hidden lg:fixed lg:top-4 lg:right-4 lg:flex lg:items-center lg:gap-3">
          {user?.name && (
            <Link
              to={
                user.domain
                  ? `/${user.name}@${user.domain}`
                  : `/${user.name}`
              }
              className="text-muted-foreground hover:text-foreground text-sm no-underline transition-colors"
            >
              {user.domain ? `${user.name}@${user.domain}` : user.name}
            </Link>
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
