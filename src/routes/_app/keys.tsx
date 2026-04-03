import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/keys")({
  component: KeysPage,
});

function KeysPage() {
  return (
    <div className="p-8 font-sans">
      <h1 className="text-foreground text-2xl font-bold">Keys</h1>
      <p className="text-muted-foreground mt-2">Coming soon.</p>
    </div>
  );
}
