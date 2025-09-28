import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import { Button } from "~app/components/ui/button";

// import type { Route } from "./+types/_index.js";

// export async function clientLoader({ params }: Route.ClientLoaderArgs) {
//   return redirect($path("/spa"));
// }

export default function AppIndex() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <div>
      <div>
        <Button>hello</Button>
      </div>
      <div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            greet();
          }}
        >
          <input
            id="greet-input"
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Enter a name..."
          />
          <Button type="submit">Greet</Button>
        </form>
        <p>{greetMsg}</p>
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
