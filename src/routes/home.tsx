import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { getMyRickroll } from "~/server/rickroll.functions";
import { Navbar } from "~/components/Navbar";

export const Route = createFileRoute("/home")({
  ssr: false,
  component: HomePage,
});

function HomePage() {
  const [rickrollId, setRickrollId] = useState<number | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getMyRickroll()
      .then((result) => {
        if (!result) {
          window.location.href = "/";
        } else {
          setRickrollId(result.id);
          setHasPassword(result.hasPassword);
        }
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking || rickrollId == null) {
    return <div className="bg-background min-h-screen" />;
  }

  return (
    <div className="bg-background min-h-screen font-sans">
      <Navbar rickrollId={rickrollId} />
      <div className="flex flex-1 items-center justify-center pt-32">
        <div className="text-center">
          <h1 className="text-accent text-4xl font-bold">Welcome</h1>
          <p className="text-foreground-dark mt-2">
            You are Rick Roll #{new Intl.NumberFormat().format(rickrollId)}
          </p>
          {!hasPassword && (
            <a
              href="/save"
              className="bg-accent/15 border-accent/50 hover:bg-accent/30 hover:border-accent/80 text-accent mt-8 inline-block cursor-pointer rounded border px-5 py-2 font-sans text-sm tracking-wide no-underline transition-all duration-300"
            >
              Save Your Number
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
