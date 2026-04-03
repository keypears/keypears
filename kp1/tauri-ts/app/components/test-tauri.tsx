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
    <div className="border-border bg-card rounded-lg border p-6">
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
          className="border-border bg-background text-foreground focus:border-primary w-full rounded-md border px-3 py-2 outline-none"
        />
        <Button type="submit" className="w-full">
          Greet
        </Button>
      </form>
      {greetMsg && (
        <p className="text-muted-foreground mt-4 text-center">{greetMsg}</p>
      )}
    </div>
  );
}
