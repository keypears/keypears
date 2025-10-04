import { Link } from "react-router";
import { $aicon } from "~app/util/aicons";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-border mt-16 border-t py-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 text-center">
        <Link
          to="/"
          className="inline-block transition-opacity hover:opacity-80"
        >
          <img
            src={$aicon("/images/keypears-3-96.webp")}
            alt="KeyPears"
            className="h-8 w-8"
          />
        </Link>
        <div className="space-y-2">
          <Link
            to="/"
            className="text-foreground hover:text-primary block font-semibold transition-opacity hover:opacity-80"
          >
            KeyPears
          </Link>
          <p className="text-muted-foreground text-sm">
            © {currentYear} Identellica LLC
          </p>
        </div>
      </div>
    </footer>
  );
}
