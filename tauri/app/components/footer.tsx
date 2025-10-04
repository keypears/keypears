import { Link } from "react-router";
import { $aicon } from "~app/util/aicons";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border py-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 text-center">
        <Link to="/" className="inline-block transition-opacity hover:opacity-80">
          <img
            src={$aicon("/images/keypears-3-96.webp")}
            alt="KeyPears"
            className="h-8 w-8"
          />
        </Link>
        <div className="space-y-2">
          <Link to="/" className="block font-semibold text-foreground hover:text-primary transition-opacity hover:opacity-80">
            KeyPears
          </Link>
          <p className="text-sm text-muted-foreground">
            © {currentYear} Identellica LLC
          </p>
        </div>
      </div>
    </footer>
  );
}
