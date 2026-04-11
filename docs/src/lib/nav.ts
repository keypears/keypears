export interface NavEntry {
  label: string;
  href: string;
  slug: string;
}

export const pageOrder: NavEntry[] = [
  { label: "Welcome", href: "/", slug: "index" },
  { label: "Addressing", href: "/protocol/addressing/", slug: "protocol/addressing" },
  { label: "Key Derivation", href: "/protocol/key-derivation/", slug: "protocol/key-derivation" },
  { label: "Encryption", href: "/protocol/encryption/", slug: "protocol/encryption" },
  { label: "Proof of Work", href: "/protocol/proof-of-work/", slug: "protocol/proof-of-work" },
  { label: "Federation", href: "/federation/", slug: "federation" },
  { label: "Self-Hosting", href: "/self-hosting/", slug: "self-hosting" },
  { label: "Security", href: "/security/", slug: "security" },
  { label: "Development", href: "/development/", slug: "development" },
];

export function getPrevNext(slug: string) {
  const idx = pageOrder.findIndex((p) => p.slug === slug);
  return {
    prev: idx > 0 ? pageOrder[idx - 1] : undefined,
    next: idx < pageOrder.length - 1 ? pageOrder[idx + 1] : undefined,
  };
}
