+++
status = "open"
opened = "2026-04-20"
+++

# KeyPears Auth: OAuth-style third-party authentication

Enable third-party websites to authenticate users via their KeyPears address.
Users type their domain into a third-party app, get redirected to their KeyPears
server's `/sign` page, approve a structured signing request, and get bounced
back — authenticated with a P-256 ECDSA signature. No passwords, no email OTPs,
no API keys, no client registration.

## Documents

- [01-init.md](01-init.md) — Research, protocol design, `/sign` page
  implementation, and `@keypears/auth` library design (Experiments 1–5)
- [02-library.md](02-library.md) — Build `@keypears/client` (typed federation
  client + auth) and integrate into RSS Anyway
