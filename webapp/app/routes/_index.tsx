import { $aicon } from "~/util/aicons";
import type { Route } from "./+types/_index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "KeyPears" },
    { name: "description", content: "Welcome to KeyPears!" },
    {
      tagName: "link",
      rel: "alternate",
      type: "application/rss+xml",
      title: "KeyPears Blog RSS Feed",
      href: "/blog/feed.xml",
    },
    {
      tagName: "link",
      rel: "alternate",
      type: "application/atom+xml",
      title: "KeyPears Blog Atom Feed",
      href: "/blog/atom.xml",
    },
    {
      tagName: "link",
      rel: "alternate",
      type: "application/json",
      title: "KeyPears Blog JSON Feed",
      href: "/blog/feed.json",
    },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.VALUE_FROM_EXPRESS };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div>
      <img
        src={$aicon("/images/keypears-3-300.webp")}
        alt="KeyPears"
        className="m-4 mx-auto block h-[150px] w-[150px]"
      />
      <h1 className="text-center text-2xl font-bold">KeyPears</h1>
      <p className="text-center text-lg">Decentralized secret sharing.</p>
    </div>
  );
}
