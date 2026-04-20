+++
status = "open"
opened = "2026-04-20"
+++

# KeyPears Auth: OAuth-style third-party authentication

## Goal

Enable third-party websites (starting with RSS Anyway at `~/dev/rssanyway`) to
authenticate users via their KeyPears address. Users type their KeyPears address
into a third-party site, get redirected to their KeyPears server, sign a
challenge, and get bounced back — authenticated. No passwords, no email OTPs.

This is OAuth + Email OTP rolled into one unified cryptosystem: the user enters
an address (like email), but instead of receiving a code, they go through a
redirect-based flow (like OAuth) where they prove ownership by signing a
challenge with their P-256 private key.

## Background

### The problem

Third-party apps (RSS Anyway, future apps) need to authenticate users without:

- Making users create yet another password
- Sending email OTPs (requires email infrastructure, slow, phishable)
- Depending on centralized identity providers (Google, GitHub, etc.)

KeyPears already has the primitives: every user has a P-256 key pair, a
discoverable address (`name@domain`), and a server that can be located via
`keypears.json`. What's missing is a standardized flow for third-party apps to
leverage this.

### Design sketch

1. **User enters their KeyPears address** on the third-party site (e.g.
   `ryan@ryanxcharles.com` on rssanyway.com).
2. **Discovery**: the third-party app fetches
   `https://ryanxcharles.com/.well-known/keypears.json` to find the API domain.
3. **Redirect to KeyPears server**: the app redirects the user to the KeyPears
   server's auth endpoint with a challenge payload.
4. **User signs the challenge**: on the KeyPears server, the user (already
   logged in or prompted to log in) signs a derived value. Critically, the user
   does NOT sign a raw string from the third party — instead, the user signs an
   HMAC: the server provides a key, which is combined with a salt (chosen by the
   third-party app) to produce a hash. The user signs that hash.
5. **Bounce back**: the user is redirected back to the third-party app with the
   signature and salt.
6. **Verification**: the third-party app verifies the signature against the
   user's public key (fetched via federation) and validates the salt matches
   what it originally sent.

### Why HMAC-then-sign (not raw signing)

If the user signs an arbitrary string from the third party, the third party
could trick the user into signing something meaningful in another context (e.g.
a transaction, a message). By having the user sign `HMAC(server_key, salt)`
instead, the signed value is:

- Unpredictable to the third party (they don't know the server key)
- Meaningless outside this specific auth flow
- Bound to the specific challenge via the salt

### Prior art to research

- **OAuth 2.0 / OIDC**: redirect-based flow, authorization codes, state
  parameter for CSRF prevention, PKCE for public clients
- **WebAuthn / FIDO2**: challenge-response with asymmetric keys, but
  device-bound rather than address-bound
- **IndieAuth**: OAuth-based, uses URLs as identity, discovery via `rel="me"`
- **DID Auth**: decentralized identity challenge-response
- **Lightning LNURL-auth**: sign a challenge with a domain-specific key derived
  from a seed — simple, no passwords, redirect-based

### Key design requirements

- **Stateless challenges where possible**: minimize server-side state
- **CSRF protection**: third-party app must bind the flow to a session (state
  parameter, like OAuth)
- **Replay prevention**: signed challenges must not be reusable
- **No phishing amplification**: the flow must not make it easier to phish
  KeyPears credentials than a direct attack on KeyPears itself
- **Library output**: the result should be a reusable library that any app can
  integrate, not just RSS Anyway

## Plan

1. Research OAuth 2.0, OIDC, WebAuthn, IndieAuth, LNURL-auth, and DID Auth.
   Identify which patterns apply and which pitfalls to avoid.
2. Design the full protocol: endpoints, challenge format, redirect flow,
   signature format, verification steps.
3. Implement the KeyPears server-side endpoints (auth challenge, callback).
4. Implement a client library (`@keypears/auth`) that third-party apps import.
5. Integrate into RSS Anyway as the first consumer.
