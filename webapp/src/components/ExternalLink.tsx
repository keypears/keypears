import type { AnchorHTMLAttributes, ReactNode } from "react";
import type {
  ExternalUrl,
  LocalAnchor,
  LocalAssetPath,
} from "~/lib/navigation";

type ExternalLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  href: ExternalUrl | LocalAnchor | LocalAssetPath;
  children: ReactNode;
};

export function ExternalLink({ href, children, ...props }: ExternalLinkProps) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}
