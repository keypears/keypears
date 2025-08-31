import { useRef, useState, useReducer, useEffect } from "react";
import type { Route } from "./+types/05-controlled-input";

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

export default function Page05({ loaderData }: Route.ComponentProps) {
  const [input, setInput] = useState("");
  const [value, setValue] = useState("");
  return (
    <div>
      <input type="text" onChange={(e) => setInput(e.target?.value)} />
      <button type="button" onClick={() => setValue(input)}>
        Search
      </button>
      <div>{value}</div>
    </div>
  );
}
