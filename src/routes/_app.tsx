import { createFileRoute, Outlet } from "@tanstack/react-router";
import { getOrCreateKeypear } from "~/server/keypears.functions";
import { Sidebar } from "~/components/Sidebar";
import { Footer } from "~/components/Footer";

export const Route = createFileRoute("/_app")({
  loader: () => getOrCreateKeypear(),
  component: AppLayout,
});

function AppLayout() {
  const data = Route.useLoaderData();

  return (
    <>
      <Sidebar keypearId={data.id} />
      <main className="flex min-h-screen flex-col lg:ml-56">
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </main>
    </>
  );
}
