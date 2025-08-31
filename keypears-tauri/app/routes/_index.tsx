import { MetaFunction, redirect } from "react-router";
import type { Route } from "./+types/_index.js";
import { $path } from "safe-routes";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

// export async function clientLoader({ params }: Route.ClientLoaderArgs) {
//   return redirect($path("/spa"));
// }

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
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
        <button type="submit">Greet</button>
      </form>
      <p>{greetMsg}</p>
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

export default function AppIndex() {
  return <App />;
}
