import type { MetaFunction } from "react-router";
import { Navbar } from "~app/components/navbar";
import { Footer } from "~app/components/footer";

export default function AppIndex() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <h1 className="mb-4 text-3xl font-bold">Welcome to KeyPears</h1>
          <p className="mb-8 text-lg text-muted-foreground">
            Your secure, local-first password manager
          </p>
          <p className="text-sm text-muted-foreground">
            Use the menu to get started
          </p>
        </div>
        <Footer />
      </div>
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
