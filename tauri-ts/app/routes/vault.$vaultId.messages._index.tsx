import type { Route } from "./+types/vault.$vaultId.messages._index";
import { Navbar } from "~app/components/navbar";
import { SearchBar } from "~app/components/search-bar";
import { MessageSquare } from "lucide-react";

// Note: Parent layout (vault.$vaultId.tsx) handles vault unlock validation
// and redirects to unlock page if needed. No need to duplicate that check here.

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const vaultId = params.vaultId;
  return { vaultId: vaultId! };
}

export default function VaultMessagesIndex({
  loaderData,
}: Route.ComponentProps) {
  const { vaultId } = loaderData;

  return (
    <>
      <Navbar vaultId={vaultId} />
      <div className="mx-auto max-w-2xl px-4 py-4">
        <SearchBar placeholder="Search messages..." />
        <div className="mt-8">
          <div className="border-border bg-card rounded-lg border p-8">
            <div className="flex flex-col items-center text-center">
              <div className="bg-primary/10 mb-4 rounded-full p-4">
                <MessageSquare className="text-primary h-8 w-8" />
              </div>
              <h2 className="mb-2 text-xl font-semibold">Coming Soon</h2>
              <p className="text-muted-foreground text-sm">
                Secure end-to-end encrypted messaging is on the way.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
