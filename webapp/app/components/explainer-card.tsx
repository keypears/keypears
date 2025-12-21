import { Link, href } from "react-router";
import { ExternalLink } from "lucide-react";

export function ExplainerCard() {
  return (
    <section className="border-border bg-card rounded-lg border p-6 text-center">
      {/* Identity visual */}
      <div className="text-primary mb-4 font-mono text-lg">
        alice@keypears.com <span className="text-muted-foreground">↔</span>{" "}
        bob@example.com
      </div>

      {/* Explanation */}
      <p className="text-muted-foreground mb-4 text-sm">
        KeyPears enables secure secret sharing between any two email-style
        addresses across different domains. Your passwords and keys stay
        encrypted end-to-end — only you and your recipient can decrypt them. The
        project is Apache 2.0-licensed and fully open source. Anyone can run a
        KeyPears node, just like email.
      </p>

      {/* Links */}
      <div className="flex justify-center gap-4 text-sm">
        <Link to={href("/blog")} className="text-primary hover:underline">
          Blog
        </Link>
        <a
          href="https://github.com/keypears/keypears"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary inline-flex items-center gap-1 hover:underline"
        >
          GitHub <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </section>
  );
}
