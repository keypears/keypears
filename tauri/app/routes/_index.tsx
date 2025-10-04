import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { Lock } from "lucide-react";
import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";
import { Button } from "~app/components/ui/button";

export default function AppIndex() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 flex-col px-4 py-8">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="mb-6 text-2xl font-bold">Your Vaults</h1>

          {/* Empty State */}
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

          {/* Secondary Action */}
          <div className="mt-4 text-center">
            <Link
              to="#"
              className="text-muted-foreground text-sm transition-opacity hover:opacity-80"
            >
              Import Existing Vault
            </Link>
          </div>
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
