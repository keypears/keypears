import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMyUser } from "~/server/user.functions";

export const Route = createFileRoute("/_app")({
  ssr: false,
  loader: async () => {
    const user = await getMyUser();
    if (!user) throw redirect({ to: "/" });
    return user;
  },
  component: () => <Outlet />,
});
