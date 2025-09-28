import { $aicon } from "~/util/aicons";
import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "KeyPears" },
    { name: "description", content: "Welcome to KeyPears!" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.VALUE_FROM_EXPRESS };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div>
      <img
        src={$aicon("/images/keypears-4-300.webp")}
        alt="KeyPears"
        className="m-4 mx-auto block h-[150px] w-[150px]"
      />
      <h1 className="text-center text-2xl font-bold">KeyPears</h1>
      <p className="text-center text-lg">Decentralized secret sharing.</p>
    </div>
  );
}
