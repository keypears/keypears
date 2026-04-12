import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { getMyUser } from "~/server/user.functions";
import { UserDropdown } from "~/components/UserDropdown";
import { Footer } from "~/components/Footer";
import { $icon } from "~/lib/icons";

// Layout for pages that are accessible whether or not you're logged in.
// Currently: public profile pages at /$profile. The directory will live
// here too. Chrome is intentionally minimal — top bar with logo and
// user dropdown (when authed), an outlet for the page, and a footer.
// No sidebar. Keeps public pages feeling lightweight and keeps the
// layout files focused per content category.

export const Route = createFileRoute("/_public")({
  loader: () => getMyUser(),
  component: PublicLayout,
});

function PublicLayout() {
  const user = Route.useLoaderData();

  return (
    <div className="flex min-h-screen flex-col font-sans">
      {/* Top bar */}
      <nav className="border-border/30 flex items-center justify-between border-b px-4 py-3 md:px-6">
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
        {user?.name && (
          <UserDropdown
            userName={user.name}
            domain={user.domain}
            hasPassword={user.hasPassword}
          />
        )}
      </nav>

      {/* Page content */}
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>

      <Footer />
    </div>
  );
}
