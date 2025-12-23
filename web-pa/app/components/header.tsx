import { href, Link } from "react-router";
import { $aicon } from "~/util/aicons";

export function Header() {
  return (
    <header className="mb-12 text-center">
      <Link to={href("/")} className="inline-block">
        <img
          src={$aicon("/images/passapples-1-300.webp")}
          alt="PassApples"
          className="mx-auto mb-6 h-[150px] w-[150px] transition-opacity hover:opacity-80"
        />
      </Link>
      <h1 className="text-3xl font-bold">PassApples</h1>
      <p className="text-muted-foreground mt-2 text-lg">
        Password Manager &middot; Encrypted Messaging &middot; Cryptocurrency
        Wallet
      </p>
    </header>
  );
}
