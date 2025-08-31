import type { Route } from "./+types/_index";
import { $aicon } from "~/util/aicons";

// biome-ignore lint/correctness/noEmptyPattern: <no reason>
export function meta({}: Route.MetaArgs) {
  return [
    { title: "ImpStack" },
    { name: "description", content: "Welcome to ImpStack!" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.VALUE_FROM_EXPRESS };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div>
      <img
        src={$aicon("/images/imp-logo-4-300.webp")}
        alt="ImpStack"
        className="w-[100px- m-4 mx-auto block h-[100px]"
      />
      <h1 className="text-center text-2xl font-bold">ImpStack</h1>
    </div>
  );
}
