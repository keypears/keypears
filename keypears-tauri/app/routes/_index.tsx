import { MetaFunction, redirect } from "react-router";
import type { Route } from "./+types/_index.js";
import { $path } from "safe-routes";

// export async function clientLoader({ params }: Route.ClientLoaderArgs) {
//   return redirect($path("/spa"));
// }

export const meta: MetaFunction = () => {
  return [
    // comment to force multiline with formatter
    { title: `KeyPears` },
    { name: "description", content: "Welcome to KeyPears!" },
  ];
};

export default function AppIndex() {
  return <>Hello.</>;
}
