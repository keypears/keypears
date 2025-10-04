import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { Button } from "~app/components/ui/button";

export function TestTauri() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
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
        <p className="mt-4 text-center text-muted-foreground">{greetMsg}</p>
      )}
    </div>
  );
}
