import { Logo } from "./logo.js";
import { Link } from "react-router";
import { $path } from "safe-routes";

export function HeaderFull() {
  return (
    <div className="mt-4 flex">
      <div className="mx-auto">
        <div className="inline-block align-middle">
          <Link to={$path("/")}>
            <Logo />
          </Link>
          <h1 className="mt-4 text-center font-bold text-2xl text-black dark:text-white">
            EarthBucks
          </h1>
        </div>
      </div>
    </div>
  );
}
