import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { getMyKeypear, createKeypear } from "~/server/keypears.functions";
import { Navbar } from "~/components/Navbar";

export const Route = createFileRoute("/")({
  ssr: false,
  component: HomePage,
});

function HomePage() {
  const [keypearId, setKeypearId] = useState<number | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const existing = await getMyKeypear();
        if (existing) {
          setKeypearId(existing.id);
          setHasPassword(existing.hasPassword);
        } else {
          const created = await createKeypear();
          setKeypearId(created.id);
        }
      } catch (err) {
        console.error("Failed to initialize keypear:", err);
      } finally {
        setChecking(false);
      }
    }
    init();
  }, []);

  if (checking || keypearId == null) {
    return <div className="bg-background min-h-screen" />;
  }

  return (
    <div className="bg-background min-h-screen font-sans">
      <Navbar keypearId={keypearId} />
      <div className="flex flex-1 items-center justify-center pt-32">
        <div className="text-center">
          <h1 className="text-accent text-4xl font-bold">Welcome</h1>
          <p className="text-foreground-dark mt-2">
            You are keypear #{new Intl.NumberFormat().format(keypearId)}
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
