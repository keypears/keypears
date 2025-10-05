import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import "./app.css";
import type { Route } from "./+types/root";
import { runMigrations } from "./db/migrate";

export async function clientLoader() {
  await runMigrations();
  return null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={
            /* This script sets the initial theme based on the user's system
             * preference. It runs before the React app hydrates to prevent a
             * flash of incorrect theme. */
            {
              __html: `
(function() {
  try {
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var root = document.documentElement;
    function update() {
      if (mql.matches) root.classList.add('dark');
      else root.classList.remove('dark');
    }
    update();
    mql.addEventListener('change', update);
  } catch (e) {}
})();
            `,
            }
          }
        />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-foreground text-xl font-semibold">
          Migrating the database...
        </h1>
      </div>
    </div>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
