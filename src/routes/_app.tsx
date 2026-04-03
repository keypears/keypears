import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMyUser } from "~/server/user.functions";
import { Sidebar } from "~/components/Sidebar";
import { Footer } from "~/components/Footer";

export const Route = createFileRoute("/_app")({
  loader: async () => {
    const user = await getMyUser();
    if (!user) throw redirect({ to: "/" });
    return user;
  },
  component: AppLayout,
});

function AppLayout() {
  const data = Route.useLoaderData();

  return (
    <>
      <Sidebar keypearId={data.id} hasPassword={data.hasPassword} />
      <main
        className={`flex flex-1 flex-col ${data.hasPassword ? "lg:ml-56" : ""}`}
      >
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </main>
    </>
  );
}
