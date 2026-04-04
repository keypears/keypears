import { createFileRoute, Outlet } from "@tanstack/react-router";
import { getMyUser } from "~/server/user.functions";
import { Sidebar } from "~/components/Sidebar";
import { Footer } from "~/components/Footer";

export const Route = createFileRoute("/_app/_saved/_chrome")({
  loader: () => getMyUser(),
  component: ChromeLayout,
});

function ChromeLayout() {
  const data = Route.useLoaderData();

  return (
    <>
      <Sidebar
        keypearId={data?.id ?? 0}
        hasPassword={data?.hasPassword ?? false}
      />
      <main
        className={`flex flex-1 flex-col ${data?.hasPassword ? "lg:ml-56" : ""}`}
      >
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </main>
    </>
  );
}
