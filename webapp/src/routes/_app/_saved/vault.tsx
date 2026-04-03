import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_saved/vault")({
  component: VaultPage,
});

function VaultPage() {
  return (
    <div className="p-8 font-sans">
      <h1 className="text-foreground text-2xl font-bold">Vault</h1>
      <p className="text-muted-foreground mt-2">Coming soon.</p>
    </div>
  );
}
