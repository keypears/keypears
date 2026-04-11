import Markdown from "react-markdown";
import { Link } from "@tanstack/react-router";

interface NavEntry {
  label: string;
  path: string;
}

const pageOrder: NavEntry[] = [
  { label: "Welcome", path: "/docs" },
  { label: "Addressing", path: "/docs/protocol/addressing" },
  { label: "Key Derivation", path: "/docs/protocol/key-derivation" },
  { label: "Encryption", path: "/docs/protocol/encryption" },
  { label: "Proof of Work", path: "/docs/protocol/proof-of-work" },
  { label: "Federation", path: "/docs/federation" },
  { label: "Self-Hosting", path: "/docs/self-hosting" },
  { label: "Security", path: "/docs/security" },
  { label: "Development", path: "/docs/development" },
];

function getPrevNext(path: string) {
  const idx = pageOrder.findIndex((p) => p.path === path);
  return {
    prev: idx > 0 ? pageOrder[idx - 1] : undefined,
    next: idx < pageOrder.length - 1 ? pageOrder[idx + 1] : undefined,
  };
}

export function DocsContent({
  title,
  content,
  path,
}: {
  title: string;
  content: string;
  path: string;
}) {
  const { prev, next } = getPrevNext(path);

  return (
    <>
      <h1 className="text-foreground mb-6 text-3xl font-bold">{title}</h1>
      <article className="prose-sm prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-a:text-accent prose-code:text-foreground prose-pre:bg-background-dark prose-pre:border-border prose-pre:border prose-li:text-foreground prose-td:text-foreground prose-th:text-foreground prose-th:text-left max-w-none">
        <Markdown>{content}</Markdown>
      </article>
      {(prev || next) && (
        <nav className="border-border/30 mt-12 flex justify-between border-t pt-4">
          {prev ? (
            <Link
              to={prev.path}
              className="text-muted-foreground hover:text-accent text-sm no-underline"
            >
              &larr; {prev.label}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              to={next.path}
              className="text-muted-foreground hover:text-accent text-sm no-underline"
            >
              {next.label} &rarr;
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
