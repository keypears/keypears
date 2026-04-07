import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import "../globals.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "KeyPears" },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon-light.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        rel: "icon",
        href: "/favicon-dark.png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground m-0 flex min-h-screen flex-col p-0">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
