import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { getMyUser } from "~/server/user.functions";
import { getMyUnreadCount } from "~/server/message.functions";
import { Sidebar } from "~/components/Sidebar";
import { Footer } from "~/components/Footer";

export const Route = createFileRoute("/_app/_saved/_chrome")({
  loader: () => getMyUser(),
  component: ChromeLayout,
});

function ChromeLayout() {
  const data = Route.useLoaderData();
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll for unread count every 5 seconds
  useEffect(() => {
    let active = true;
    async function poll() {
      while (active) {
        try {
          const count = await getMyUnreadCount();
          if (!active) break;
          setUnreadCount(count);
        } catch {
          // ignore
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    poll();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <Sidebar
        keypearId={data?.id ?? 0}
        hasPassword={data?.hasPassword ?? false}
        unreadCount={unreadCount}
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
