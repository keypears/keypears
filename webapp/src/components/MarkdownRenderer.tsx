import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "~/components/ExternalLink";
import type {
  ExternalUrl,
  LocalAnchor,
  LocalAssetPath,
} from "~/lib/navigation";
import type { FileRouteTypes } from "~/routeTree.gen";

type MarkdownRoutePath = Exclude<
  FileRouteTypes["to"],
  "/$profile" | "/blog/$slug" | "/channel/$address" | "/vault/$id"
>;

const markdownRoutes = new Set<MarkdownRoutePath>([
  "/",
  "/login",
  "/privacy",
  "/terms",
  "/welcome",
  "/sign",
  "/docs/development",
  "/docs/domain-claiming",
  "/docs/federation",
  "/docs/security",
  "/docs/self-hosting",
  "/blog",
  "/docs",
  "/domains",
  "/home",
  "/inbox",
  "/keys",
  "/password",
  "/send",
  "/settings",
  "/vault",
  "/docs/protocol/addressing",
  "/docs/protocol/encryption",
  "/docs/protocol/key-derivation",
  "/docs/protocol/proof-of-work",
]);

const markdownAssetPaths = new Set<LocalAssetPath>(["/keypears.pdf"]);

function splitHash(href: string): {
  path: string;
  hash?: LocalAnchor;
} {
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) return { path: href };
  const hash = href.slice(hashIndex);
  return {
    path: href.slice(0, hashIndex),
    hash: hash.startsWith("#") ? (hash as LocalAnchor) : undefined,
  };
}

function isExternalUrl(href: string): href is ExternalUrl {
  return href.startsWith("http://") || href.startsWith("https://");
}

function isMarkdownRoutePath(path: string): path is MarkdownRoutePath {
  return markdownRoutes.has(path as MarkdownRoutePath);
}

function isMarkdownAssetPath(path: string): path is LocalAssetPath {
  return markdownAssetPaths.has(path as LocalAssetPath);
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, href }) => {
          const target = href ?? "";
          if (isExternalUrl(target)) {
            return (
              <ExternalLink
                href={target}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                {children}
              </ExternalLink>
            );
          }

          const { path, hash } = splitHash(target);
          if (path === "" && hash) {
            return (
              <ExternalLink
                href={hash}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                {children}
              </ExternalLink>
            );
          }

          if (isMarkdownRoutePath(path)) {
            return (
              <Link
                to={path}
                hash={hash}
                onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.stopPropagation();
                }}
              >
                {children}
              </Link>
            );
          }

          if (isMarkdownAssetPath(path)) {
            return (
              <ExternalLink
                href={path}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                {children}
              </ExternalLink>
            );
          }

          return (
            <span
              onClick={(e: React.MouseEvent<HTMLSpanElement>) => {
                e.stopPropagation();
              }}
            >
              {children}
            </span>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
