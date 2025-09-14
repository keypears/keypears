import { Outlet, Meta, Links, ScrollRestoration, Scripts } from "react-router";
import "./style.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
  return <div>Loading...</div>;
}

export default function App() {
  return <Outlet />;
}
