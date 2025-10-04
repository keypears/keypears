import { Link } from "react-router";
import { $aicon } from "~app/util/aicons";

export function Header() {
  return (
    <header className="mb-12 text-center">
      <Link to="/" className="inline-block">
        <img
          src={$aicon("/images/keypears-3-300.webp")}
          alt="KeyPears"
          className="mx-auto mb-6 h-[150px] w-[150px] transition-opacity hover:opacity-80"
        />
      </Link>
      <h1 className="text-3xl font-bold">KeyPears</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Decentralized secret sharing.
      </p>
    </header>
  );
}
