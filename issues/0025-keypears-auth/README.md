+++
status = "closed"
opened = "2026-04-20"
closed = "2026-04-21"
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

## Conclusion

KeyPears Auth is implemented and working in production. The protocol is a hybrid
of OAuth's redirect UX, LNURL-auth's challenge-sign-verify model, and
email-style federated discovery — with no client registration, no tokens, and no
API keys.

**What was built:**

- **Protocol**: user types their domain, app discovers the API server via
  `keypears.json`, redirects to `/sign`, user signs a structured JSON payload
  with P-256 ECDSA, app verifies the signature against the user's public key
  fetched via federation.
- **`/sign` page** (`webapp/src/routes/_app/_saved/sign.tsx`): consent screen
  with query param validation, redirect_uri domain matching, server-generated
  nonce/timestamp/expires, client-side P-256 signing, base64url signature
  output.
- **`@keypears/client`** (`packages/client/`): oRPC contract for 5 federation
  endpoints, typed client factory, discovery, and auth helpers (`buildSignUrl`,
  `verifyCallback`, `generateState`, `buildCanonicalPayload`).
- **RSS Anyway integration**: first consumer, full sign-in round-trip working
  across two separate servers.

**Key decisions:**

- Domain-only input (not full address) — privacy + identity selection
- Structured typed signing (not HMAC) — schema prevents cross-context reuse
- oRPC contracts as single source of truth — runtime + compile-time enforcement
- Server-generated challenge values — server clock controls expiry
- TanStack Start functions unchanged — only federation/auth in oRPC contract
- Blog post published: "Sign In With Your Address"
