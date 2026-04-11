import { createFileRoute, Link } from "@tanstack/react-router";
import { getMyUser } from "~/server/user.functions";
import { $icon } from "~/lib/icons";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

export const Route = createFileRoute("/_app/_saved/_chrome/home")({
  head: () => ({ meta: [{ title: "KeyPears" }] }),
  loader: () => getMyUser(),
  component: HomePage,
});

function HomePage() {
  const user = Route.useLoaderData();
  const greeting = getGreeting();
  const address =
    user?.name && user?.domain ? `${user.name}@${user.domain}` : null;

  return (
    <div className="flex flex-1 items-center justify-center font-sans">
      <div className="mt-32 text-center">
        <picture>
          <source
            srcSet={`${$icon("/images/keypears-dark-200.webp")} 1x, ${$icon("/images/keypears-dark-400.webp")} 2x`}
            media="(prefers-color-scheme: dark)"
          />
          <img
            src={$icon("/images/keypears-light-200.webp")}
            srcSet={`${$icon("/images/keypears-light-200.webp")} 1x, ${$icon("/images/keypears-light-400.webp")} 2x`}
            alt="KeyPears"
            className="mx-auto h-16 w-16"
          />
        </picture>
        <p className="text-muted-foreground mt-8 text-lg">{greeting},</p>
        {address && (
          <Link
            to="/$profile"
            params={{ profile: address }}
            className="text-foreground mt-1 block text-lg no-underline hover:underline"
          >
            {address}
          </Link>
        )}
      </div>
    </div>
  );
}
