import { href, Link } from "react-router";
import { $aicon } from "~/util/aicons";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-border mt-16 border-t py-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 text-center">
        <Link
          to={href("/")}
          className="inline-block transition-opacity hover:opacity-80"
        >
          <img
            src={$aicon("/images/passapples-2-96.webp")}
            alt="PassApples"
            className="h-8 w-8"
          />
        </Link>
        <div className="space-y-2">
          <Link
            to={href("/")}
            className="text-foreground hover:text-primary block font-semibold transition-opacity hover:opacity-80"
          >
            PassApples
          </Link>
          <div className="text-muted-foreground flex justify-center gap-2 text-sm">
            <Link
              to={href("/about")}
              className="hover:text-primary transition-opacity hover:opacity-80"
            >
              About
            </Link>
            <span>·</span>
            <Link
              to={href("/privacy")}
              className="hover:text-primary transition-opacity hover:opacity-80"
            >
              Privacy
            </Link>
            <span>·</span>
            <Link
              to={href("/terms")}
              className="hover:text-primary transition-opacity hover:opacity-80"
            >
              Terms
            </Link>
          </div>
          <p className="text-muted-foreground text-sm">
            © {currentYear} Identellica LLC
          </p>
        </div>
      </div>
    </footer>
  );
}
