import { useRef, useState } from "react";
import type { Route } from "./+types/01-set-state";

// biome-ignore lint/correctness/noEmptyPattern: <suppress>
export function meta({}: Route.MetaArgs) {
  return [
    { title: "ImpStack" },
    { name: "description", content: "Welcome to ImpStack!" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.VALUE_FROM_EXPRESS };
}

export default function Page01({ loaderData }: Route.ComponentProps) {
  const [searchInput, setSearchInput] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input type="text" ref={inputRef} />
      <button
        type="button"
        onClick={() => setSearchInput(inputRef?.current?.value || "")}
      >
        Search
      </button>
      <div>{searchInput}</div>
    </div>
  );
}
