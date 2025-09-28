import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import { Button } from "~app/components/ui/button";
import { $aicon } from "~app/util/aicons";

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
        <img
          src={$aicon("/images/keypears-3-300.webp")}
          alt="KeyPears"
          className="m-4 mx-auto block h-[150px] w-[150px]"
        />
        <h1 className="text-center text-2xl font-bold">KeyPears</h1>
        <p className="text-center text-lg">Decentralized secret sharing.</p>
      </div>
      <hr className="my-4" />
      <h2 className="text-xl font-semibold">Test Generate Password</h2>
      <div>
        <Button>hello</Button>
      </div>
      <hr className="my-4" />
      <h2 className="text-xl font-semibold">Test Tauri</h2>
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
          <Button
            type="submit"
            className="bg-secondary text-secondary-foreground"
          >
            Greet
          </Button>
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
