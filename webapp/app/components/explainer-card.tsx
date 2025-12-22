import { Link, href } from "react-router";
import { ExternalLink, Sun, Moon, Link2, ShieldCheck } from "lucide-react";

export function ExplainerCard() {
  return (
    <section className="border-border bg-card rounded-lg border p-6">
      {/* Slogan */}
      <div className="mb-4 text-center text-lg font-semibold">
        End-to-end encrypted secret sharing across domains
      </div>

      {/* Identity visual */}
      <div className="text-primary mb-4 text-center font-mono text-lg">
        alice@keypears.com <span className="text-muted-foreground">↔</span>{" "}
        bob@example.com
      </div>

      {/* DH Illustration */}
      <div className="bg-muted/30 mb-4 rounded-lg p-4 text-sm">
        {/* Two-column: Alice and Bob */}
        <div className="grid grid-cols-2 gap-4">
          {/* Alice */}
          <div className="text-center">
            <div className="font-semibold">Alice</div>
            <div className="text-muted-foreground mt-1 space-y-1 text-xs">
              <div className="flex items-center justify-center gap-1">
                <Moon className="h-3 w-3" /> private key
              </div>
              <div className="flex items-center justify-center gap-1">
                <Sun className="h-3 w-3" /> public key
              </div>
            </div>
          </div>

          {/* Bob */}
          <div className="text-center">
            <div className="font-semibold">Bob</div>
            <div className="text-muted-foreground mt-1 space-y-1 text-xs">
              <div className="flex items-center justify-center gap-1">
                <Moon className="h-3 w-3" /> private key
              </div>
              <div className="flex items-center justify-center gap-1">
                <Sun className="h-3 w-3" /> public key
              </div>
            </div>
          </div>
        </div>

        {/* Multiplication row */}
        <div className="text-muted-foreground mt-3 grid grid-cols-2 gap-4 text-center text-xs">
          <div className="flex items-center justify-center gap-1">
            Alice&apos;s <Moon className="h-3 w-3" /> × Bob&apos;s{" "}
            <Sun className="h-3 w-3" />
          </div>
          <div className="flex items-center justify-center gap-1">
            Bob&apos;s <Moon className="h-3 w-3" /> × Alice&apos;s{" "}
            <Sun className="h-3 w-3" />
          </div>
        </div>

        {/* Arrows down */}
        <div className="text-muted-foreground mt-2 text-center">↓</div>

        {/* Shared secret */}
        <div className="text-primary mt-1 flex items-center justify-center gap-1 text-sm font-medium">
          <Link2 className="h-4 w-4" /> same shared secret
        </div>

        {/* Encrypted message */}
        <div className="text-muted-foreground mt-2 text-center">↓</div>
        <div className="mt-1 flex items-center justify-center gap-1 text-sm">
          <ShieldCheck className="h-4 w-4" /> encrypted messages
        </div>
      </div>

      {/* Explanation */}
      <p className="text-muted-foreground mb-4 text-sm">
        KeyPears enables secure secret sharing between any two email addresses
        across different domains. Your passwords and keys stay encrypted
        end-to-end — only you and your recipient can decrypt them. The software
        is open source and anyone can run a server, just like email.
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
