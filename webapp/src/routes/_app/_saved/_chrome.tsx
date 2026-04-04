import { createFileRoute, Outlet } from "@tanstack/react-router";
import { getMyUser } from "~/server/user.functions";
import { getServerDomain } from "~/server/config.functions";
import { Sidebar } from "~/components/Sidebar";
import { Footer } from "~/components/Footer";
import { ChannelProvider } from "~/lib/channel-context";

export const Route = createFileRoute("/_app/_saved/_chrome")({
  loader: async () => {
    const [user, domain] = await Promise.all([
      getMyUser(),
      getServerDomain(),
    ]);
    return { ...user, domain };
  },
  component: ChromeLayout,
});

function ChromeLayout() {
  const data = Route.useLoaderData();

  return (
    <ChannelProvider>
      <Sidebar
        userName={data?.name ?? null}
        hasPassword={data?.hasPassword ?? false}
        domain={data?.domain ?? "keypears.com"}
      />
      <main
        className={`flex flex-1 flex-col ${data?.hasPassword ? "lg:ml-56" : ""}`}
      >
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </main>
    </ChannelProvider>
  );
}
