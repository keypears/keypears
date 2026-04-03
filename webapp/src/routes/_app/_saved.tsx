import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMyUser } from "~/server/user.functions";

export const Route = createFileRoute("/_app/_saved")({
  loader: async () => {
    const user = await getMyUser();
    if (!user) throw redirect({ to: "/" });
    if (!user.hasPassword) throw redirect({ to: "/welcome" });
    return user;
  },
  component: () => <Outlet />,
});
