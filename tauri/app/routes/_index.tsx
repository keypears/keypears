import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import { Button } from "~app/components/ui/button";
import { Header } from "~app/components/header";
import { Footer } from "~app/components/footer";
import { PasswordGenerator } from "~app/components/password-generator";

export default function AppIndex() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

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
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-xl font-semibold">Test Tauri</h2>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                greet();
              }}
            >
              <input
                id="greet-input"
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder="Enter a name..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
              />
              <Button type="submit" className="w-full">
                Greet
              </Button>
            </form>
            {greetMsg && (
              <p className="mt-4 text-center text-muted-foreground">
                {greetMsg}
              </p>
            )}
          </div>
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
