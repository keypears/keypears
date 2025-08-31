import { useRef, useState, useReducer } from "react";
import type { Route } from "./+types/03-use-reducer";

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

export default function Page03({ loaderData }: Route.ComponentProps) {
  const [searchInput, dispatch] = useReducer(
    (prevState: string, action: string): string => {
      return prevState + action;
    },
    "",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input type="text" ref={inputRef} />
      <button
        type="button"
        onClick={() => dispatch(inputRef?.current?.value || "")}
      >
        Append
      </button>
      <div>{searchInput}</div>
    </div>
  );
}
