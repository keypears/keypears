import type { Route } from "./+types/about";
import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";
import { getResolvedDbPath } from "~app/db";
import { Info } from "lucide-react";
import { useState, useEffect } from "react";

export async function clientLoader(_args: Route.ClientLoaderArgs) {
  // Wait a bit for database initialization if needed
  await new Promise((resolve) => setTimeout(resolve, 100));
  const dbPath = getResolvedDbPath();
  return { dbPath };
}

export default function About({ loaderData }: Route.ComponentProps) {
  const [dbPath, setDbPath] = useState(loaderData.dbPath);

  useEffect(() => {
    setDbPath(loaderData.dbPath);
  }, [loaderData.dbPath]);

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col px-4 py-8">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">About KeyPears</h1>
          </div>

          <div className="border-border bg-card rounded-lg border p-6">
            <div className="flex flex-col gap-6">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 rounded-full p-2">
                  <Info className="text-primary h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h2 className="mb-1 font-semibold">Database Location</h2>
                  <p className="text-muted-foreground font-mono text-sm break-all">
                    {dbPath || "Not yet initialized"}
                  </p>
                </div>
              </div>

              <div className="border-border border-t pt-6">
                <h2 className="mb-2 font-semibold">Version</h2>
                <p className="text-muted-foreground text-sm">0.1.0</p>
              </div>

              <div className="border-border border-t pt-6">
                <h2 className="mb-2 font-semibold">License</h2>
                <p className="text-muted-foreground text-sm">
                  Apache 2.0 - Open Source
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
