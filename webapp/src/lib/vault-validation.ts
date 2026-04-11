/** Try to extract a domain from user input (may be a URL or bare domain). */
export function parseDomainInput(input: string): {
  domain: string | null;
  hint: string | null;
} {
  const trimmed = input.trim();
  if (!trimmed) return { domain: null, hint: null };

  // If it looks like a URL, extract the hostname
  try {
    const hasProtocol = /^https?:\/\//i.test(trimmed);
    if (hasProtocol || trimmed.includes("/")) {
      const url = new URL(hasProtocol ? trimmed : `https://${trimmed}`);
      if (url.hostname && url.hostname !== trimmed) {
        return {
          domain: url.hostname,
          hint: `Did you mean ${url.hostname}?`,
        };
      }
    }
  } catch {
    // not a valid URL, treat as domain
  }

  // Check for basic domain validity (has a dot with something after it)
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return { domain: trimmed, hint: null };
  }

  // No TLD — might be intentional (localhost, intranet)
  if (trimmed.length > 0 && !trimmed.includes(".")) {
    return { domain: trimmed, hint: "No TLD — is this correct?" };
  }

  return { domain: trimmed, hint: null };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(input: string): string | null {
  if (!input.trim()) return null;
  if (!EMAIL_REGEX.test(input.trim())) return "Invalid email format";
  return null;
}
