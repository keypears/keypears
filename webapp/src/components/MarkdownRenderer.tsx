import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "@tanstack/react-router";

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, href }) => {
          const isExternal =
            String(href).startsWith("http://") ||
            String(href).startsWith("https://");
          return (
            <Link
              to={href || ""}
              target={isExternal ? "_blank" : undefined}
              onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.stopPropagation();
              }}
            >
              {children}
            </Link>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
