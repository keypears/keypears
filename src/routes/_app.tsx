import { createFileRoute, Outlet } from "@tanstack/react-router";
import { getOrCreateUser } from "~/server/user.functions";
import { Sidebar } from "~/components/Sidebar";
import { Footer } from "~/components/Footer";

export const Route = createFileRoute("/_app")({
  loader: () => getOrCreateUser(),
  component: AppLayout,
});

function AppLayout() {
  const data = Route.useLoaderData();

  return (
    <>
      <Sidebar keypearId={data.id} />
      <main className="flex flex-1 flex-col lg:ml-56">
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </main>
    </>
  );
}
