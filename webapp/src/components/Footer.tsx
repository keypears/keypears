import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="border-border/30 text-muted-foreground mt-12 flex flex-col items-center gap-2 border-t pt-4 pb-6 text-xs">
      <a
        href="https://astrohacker.com"
        className="hover:text-accent flex items-center gap-2 no-underline"
      >
        <picture>
          <source
            srcSet="/images/astrohacker-6-dark-32.webp 1x, /images/astrohacker-6-dark-64.webp 2x"
            media="(prefers-color-scheme: dark)"
          />
          <img
            src="/images/astrohacker-6-light-32.webp"
            srcSet="/images/astrohacker-6-light-32.webp 1x, /images/astrohacker-6-light-64.webp 2x"
            alt="Astrohacker logo"
            className="h-5 w-5"
          />
        </picture>
        An Astrohacker Project
      </a>
      <div className="flex gap-3">
        <Link to="/terms" className="hover:text-accent no-underline">
          Terms
        </Link>
        <span>&middot;</span>
        <Link to="/privacy" className="hover:text-accent no-underline">
          Privacy
        </Link>
        <span>&middot;</span>
        <Link to="/docs" className="hover:text-accent no-underline">
          Docs
        </Link>
      </div>
      <p>&copy; {new Date().getFullYear()} Astrohacker. All rights reserved.</p>
    </footer>
  );
}
