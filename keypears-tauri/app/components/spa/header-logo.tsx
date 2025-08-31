import { Link } from "react-router";
import { Logo } from "./logo.js";
import { $path } from "safe-routes";

export function HeaderLogo() {
  return (
    <div className="mt-4 flex">
      <div className="mx-auto">
        <div className="inline-block align-middle">
          <Link to={$path("/")}>
            <Logo />
          </Link>
        </div>
      </div>
    </div>
  );
}
