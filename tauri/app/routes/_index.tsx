import type { MetaFunction } from "react-router";
import type { Route } from "./+types/_index";
import { Link } from "react-router";
import { Lock } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";
import { Button } from "~app/components/ui/button";
import { getVaults } from "~app/db/models/vault";

export async function clientLoader(_args: Route.ClientLoaderArgs) {
  const vaults = await getVaults();
  return { vaults };
}

export default function AppIndex({ loaderData }: Route.ComponentProps) {
  const { vaults } = loaderData;
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col px-4 py-8">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Your Vaults</h1>
            {vaults.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link to="#">Import Existing Vault</Link>
                </Button>
                <Button asChild>
                  <Link to="/new-vault/1">Create Vault</Link>
                </Button>
              </div>
            )}
          </div>

          {vaults.length === 0 ? (
            /* Empty State */
            <div className="border-border bg-card rounded-lg border p-8">
              <div className="flex flex-col items-center text-center">
                <div className="bg-primary/10 mb-4 rounded-full p-4">
                  <Lock className="text-primary h-8 w-8" />
                </div>
                <h2 className="mb-2 text-xl font-semibold">No vaults yet</h2>
                <p className="text-muted-foreground mb-6 text-sm">
                  Create your first vault to get started
                </p>
                <Button size="lg" className="w-full" asChild>
                  <Link to="/new-vault/1">Create Vault</Link>
                </Button>
              </div>
            </div>
          ) : (
            /* Vault List */
            <div className="space-y-3">
              {vaults.map((vault) => (
                <div
                  key={vault.id}
                  className="border-border bg-card rounded-lg border p-4 transition-colors hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 rounded-full p-2">
                      <Lock className="text-primary h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{vault.name}@localhost</h3>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [
    // comment to force multiline with formatter
    { title: `KeyPears` },
    { name: "description", content: "Welcome to KeyPears!" },
  ];
};
