import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { DocsSidebar } from "~/components/DocsSidebar";
import { Footer } from "~/components/Footer";
import { $icon } from "~/lib/icons";

export const Route = createFileRoute("/_docs")({
  component: DocsLayout,
});

function DocsLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Navbar */}
      <nav className="border-border/30 sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-6 py-3">
        <Link to="/docs" className="flex items-center gap-2 no-underline">
          <picture>
            <source
              srcSet={$icon("/images/keypears-dark-32.webp")}
              media="(prefers-color-scheme: dark)"
            />
            <img
              src={$icon("/images/keypears-light-32.webp")}
              alt="KeyPears"
              className="h-6 w-6"
            />
          </picture>
          <span className="text-foreground text-sm font-bold">
            KeyPears Docs
          </span>
        </Link>
        <div className="flex-1" />
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground text-xs no-underline"
        >
          keypears.com
        </Link>
      </nav>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-5xl flex-1">
        <DocsSidebar />
        <main className="min-w-0 flex-1 px-6 py-8 md:px-10">
          <Outlet />
          <Footer />
        </main>
      </div>
    </div>
  );
}
