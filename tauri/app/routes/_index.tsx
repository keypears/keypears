import type { MetaFunction } from "react-router";
import { Header } from "~app/components/header";
import { Footer } from "~app/components/footer";
import { PasswordGenerator } from "~app/components/password-generator";
import { TestTauri } from "~app/components/test-tauri";

export default function AppIndex() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Header />

        {/* Password Generator */}
        <section className="mt-8">
          <PasswordGenerator />
        </section>

        {/* Tauri Test Section */}
        <section className="mt-12">
          <TestTauri />
        </section>

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
