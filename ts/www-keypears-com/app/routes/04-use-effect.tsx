import { useRef, useState, useReducer, useEffect } from "react";
import type { Route } from "./+types/04-use-effect";

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

function DisplayValue({ value }: { value: string }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  return <div>{displayValue}</div>;
}

export default function Page04({ loaderData }: Route.ComponentProps) {
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
      <DisplayValue value={searchInput} />
    </div>
  );
}
