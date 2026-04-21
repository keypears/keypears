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

1. **User enters their domain** on the third-party site (e.g. `example.com` on
   rssanyway.com — the domain from their KeyPears address `alice@example.com`).
2. **Discovery**: the third-party app fetches
   `https://example.com/.well-known/keypears.json` to find the `apiDomain`. The
   API domain may be the same as the address domain, or it may be different
   (e.g. `keypears.example.com`, or `keypears.com`).
3. **Redirect to API domain**: the app redirects the user to the `apiDomain`'s
   `/sign` page with a structured signing request.
4. **User reviews and signs**: on the KeyPears server, the user (already logged
   in or prompted to log in) sees a human-readable consent screen rendered from
   the structured request (e.g. "rssanyway.com wants to verify your identity").
   The user approves, and their browser signs the structured payload with their
   P-256 private key.
5. **Bounce back**: the user is redirected back to the third-party app with the
   signature and the signed payload.
6. **Verification**: the third-party app verifies the signature against the
   user's public key (fetched via federation) and validates the payload fields
   match what it originally sent.

### Structured signing (not raw or HMAC signing)

Users only sign structured payloads validated against known templates. Each
template has a `type` field that determines its schema and how the consent
screen renders. For `sign-in`:

```json
{
  "type": "sign-in",
  "domain": "rssanyway.com",
  "address": "alice@example.com",
  "nonce": "a1b2c3...",
  "timestamp": "2026-04-21T12:00:00Z",
  "expires": "2026-04-21T12:10:00Z"
}
```

This approach replaces the earlier HMAC-then-sign design. The HMAC was meant to
prevent the user from signing something meaningful in another context, but typed
templates solve this more cleanly — a `sign-in` payload cannot be confused with
a message, a transaction, or any other action because the schema is different.

Structured signing also makes the flow fully verifiable by the third-party app
without trusting the KeyPears server: the app constructs the payload, the user
signs it, the app verifies the signature over the exact payload it built. No
server-side key, no intermediate computation.

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

## Experiment 1: Research prior art and determine protocol approach

### Goal

Understand OAuth 2.0, OIDC, and LNURL-auth well enough to determine whether
KeyPears Auth should extend OAuth, follow its patterns loosely, or invent a
distinct protocol.

### Research findings

#### OAuth 2.0 (RFC 6749) — Authorization Code Grant

**Roles:** Resource Owner (user), Client (third-party app), Authorization Server
(issues tokens), Resource Server (hosts protected resources).

**Flow:**

1. Client redirects user to Authorization Server with `response_type=code`,
   `client_id`, `redirect_uri`, `scope`, `state`.
2. Authorization Server authenticates user and asks for consent.
3. Authorization Server redirects back to `redirect_uri` with an authorization
   code and `state`.
4. Client exchanges code for access token server-to-server (using
   `client_secret`).
5. Client uses access token to call APIs.

**Security mechanisms:**

- `state` parameter: random value bound to session, prevents CSRF.
- Authorization code: single-use, short-lived (~10 min).
- `client_secret`: code-to-token exchange is server-to-server, secret never
  reaches browser.
- `redirect_uri` validation: must exactly match registered URI.
- PKCE (RFC 7636): for public clients (SPAs, mobile), replaces `client_secret`
  with a `code_verifier`/`code_challenge` pair.

**Server state:** registered clients (client_id, secret, redirect_uris), issued
authorization codes, issued tokens.

#### OIDC (OpenID Connect) — Identity layer on OAuth

Adds to OAuth:

- **ID Token**: JWT with `sub`, `iss`, `aud`, `exp`, `nonce`. Signed by the
  provider. This IS the identity assertion.
- **UserInfo endpoint**: standard endpoint for profile claims.
- **Discovery**: `/.well-known/openid-configuration` returns endpoints, signing
  algorithms, JWKS URI. Enables automatic client configuration.
- **`nonce`**: client-generated random value embedded in ID token, prevents
  replay.

Flow is identical to OAuth Authorization Code — just add `scope=openid` and you
get back an `id_token`.

#### LNURL-auth (Lightning Network)

A fundamentally simpler model: pure challenge-response, no tokens, no scopes, no
client registration.

**Flow:**

1. Server generates random `k1` (32-byte challenge), encodes as URL/QR.
2. Wallet scans QR, derives a domain-specific key pair from master seed.
3. Wallet signs `k1` with the domain-specific private key.
4. Wallet calls server with `k1`, `sig`, and `key` (public key).
5. Server verifies signature against provided pubkey. Authenticated.

**Security mechanisms:**

- `k1` is single-use and short-lived (replay prevention).
- Domain-specific key derivation: each site gets a unique key pair from the same
  seed — prevents cross-site correlation and defeats phishing (a fake domain
  produces a useless key pair).
- No secrets transmitted — only signature and public key.

**Server state:** pending challenges (`k1 → expiry`), user accounts
(`pubkey → user`). No client registrations, no token stores.

### Analysis: what applies to KeyPears

| Aspect                 | OAuth/OIDC                         | LNURL-auth                      | KeyPears Auth                                                       |
| ---------------------- | ---------------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| Identity model         | Centralized provider               | Per-domain derived key          | Federated address + persistent key                                  |
| Discovery              | Client pre-registers with provider | None (QR scan)                  | `keypears.json` on user's domain                                    |
| User interaction       | Redirect to provider               | Scan QR in wallet               | Redirect to user's KeyPears server                                  |
| Proof of identity      | Password at provider, then token   | Sign challenge with derived key | Sign challenge with P-256 key                                       |
| Client registration    | Required (client_id/secret)        | Not needed                      | Not needed                                                          |
| Tokens/sessions        | Access tokens, refresh tokens      | None — one-shot                 | None — one-shot proof                                               |
| Cross-site correlation | Same `sub` across all clients      | Impossible by design            | Same public key across all clients (acceptable — address is public) |

#### What we take from OAuth/OIDC

1. **Redirect-based flow**: two browser redirects (app → KeyPears → app). This
   is the right UX for a web app.
2. **`state` parameter for CSRF**: the third-party app generates a random state,
   stores it in session, sends it in the redirect, and verifies it on callback.
   Essential.
3. **`redirect_uri` in the challenge**: so the KeyPears server knows where to
   bounce back. Unlike OAuth, we don't require pre-registration — the URI is
   part of the signed challenge data itself.
4. **Discovery via well-known path**: OIDC uses
   `/.well-known/openid-configuration`. We already have
   `/.well-known/keypears.json`. Same pattern.

#### What we take from LNURL-auth

1. **Challenge-response with signing**: the core mechanism. User proves identity
   by signing a challenge, not by entering a password at the provider.
2. **No client registration**: any app can initiate the flow without
   pre-registering with the KeyPears server. This is critical for a federated
   system — you can't require every third-party app to register with every
   possible KeyPears server.
3. **Single-use challenges**: replay prevention via tracking used challenges.
4. **Minimal server state**: only pending challenges need tracking.

#### What we invent new

1. **Federated discovery from an address**: the user types `name@domain`, the
   app fetches `domain/.well-known/keypears.json` to find the API domain, then
   redirects there. Neither OAuth nor LNURL-auth has this — OAuth assumes you
   know the provider upfront, LNURL-auth uses QR codes.
2. **Structured, typed signing**: rather than signing a raw challenge or an
   HMAC, the user signs a structured JSON payload validated against a known
   template (e.g. `type: "sign-in"`). The template schema makes the signed value
   contextually bound — it cannot be confused with a message, transaction, or
   any other action. The KeyPears UI renders a human-readable consent screen
   from the template fields.
3. **Signature verification via federation**: the third-party app verifies the
   signature against the user's public key, which it fetches from the user's
   KeyPears server via the existing federation API. This is the "identity
   assertion" — equivalent to OIDC's ID token, but it's a raw P-256 signature
   verifiable against a discoverable public key rather than a JWT signed by a
   centralized provider.

### Conclusion

**We do NOT need to implement OAuth or be OAuth-compatible.** OAuth solves a
different problem (delegated authorization — "let this app access my data") and
requires client registration. KeyPears Auth solves authentication only ("prove
you own this address") with no pre-registration.

**The protocol is a hybrid** — LNURL-auth's challenge-sign-verify model,
delivered via OAuth's redirect UX, with email-style federated discovery:

- From OAuth: redirect flow, `state` parameter, `redirect_uri`
- From LNURL-auth: challenge-response signing, no client registration, no tokens
- New to KeyPears: address-based federated discovery, structured typed signing

The result is a simple, three-step browser flow:

1. App → KeyPears server (with challenge + state + redirect_uri)
2. User signs on KeyPears server
3. KeyPears server → App (with signature + state)

No tokens to manage, no client secrets, no refresh flows. One signature proves
identity. The app verifies it against the user's public key fetched via
federation.

### Result: Pass

Clear direction established. KeyPears Auth is a new protocol that borrows the
redirect UX from OAuth and the sign-to-authenticate model from LNURL-auth, but
requires neither client registration nor token management. Next experiment
should design the full protocol specification.

## Experiment 2: Research WebAuthn, IndieAuth, and DID Auth

### Goal

Complete the prior art survey by analyzing WebAuthn/FIDO2, IndieAuth, and DID
Auth — the remaining protocols listed in the background section.

### Research findings

#### WebAuthn / FIDO2

**Roles:** Relying Party (website), Client (browser), Authenticator (hardware
key or platform biometric).

**Registration flow:**

1. RP sends challenge (random bytes) + RP ID (domain) + user info to browser.
2. Browser forwards to authenticator along with RP ID origin.
3. Authenticator generates a new key pair scoped to the RP ID. Returns public
   key + credential ID + attestation, signed by the authenticator.
4. RP stores: credential ID, public key, sign count, user handle.

**Authentication flow:**

1. RP sends challenge + list of allowed credential IDs.
2. Browser forwards to authenticator, which looks up credential by RP ID.
3. Authenticator signs `{authenticatorData || clientDataHash}` where
   clientDataHash covers the challenge and the origin.
4. RP verifies signature against stored public key, checks sign count increased.

**Security mechanisms:**

- Phishing resistance: credentials are domain-bound — the authenticator checks
  RP ID against the origin. A phishing site on a different domain cannot trigger
  the credential.
- Replay prevention: server-generated random challenge; sign count monotonically
  increases.
- No shared secrets: only public keys stored server-side.
- Origin binding: the browser embeds the origin into `clientDataJSON`, which is
  signed.

**Server state:** per-credential: public key, credential ID, sign count.
Ephemeral: challenge (valid for one ceremony, ~minutes TTL).

**Strengths:** Strongest phishing resistance of any web auth protocol. No
passwords. Hardware-rooted key material. Well-supported in browsers.

**Weaknesses:** Requires a local authenticator — not portable across devices
without platform sync (passkeys address this but add cloud trust). No federation
story; each RP is independent. Cannot prove identity to a third party — the
credential is RP-scoped.

#### IndieAuth

**Flow:**

1. User enters their URL (e.g. `https://alice.example`) at the client app.
2. Client fetches that URL, discovers `rel="authorization_endpoint"` via HTML
   `<link>` tags or HTTP Link headers.
3. Client redirects user to the authorization endpoint with: `client_id`
   (client's URL), `redirect_uri`, `state`, `code_challenge` (PKCE), `scope`.
4. Authorization endpoint authenticates the user (method unspecified).
5. On approval, authorization endpoint redirects back with an authorization
   code.
6. Client exchanges the code at the authorization endpoint. Response includes
   `me` — the canonical user URL.
7. Client verifies `me` matches the originally entered URL.

**Security mechanisms:**

- PKCE: `code_challenge`/`code_verifier` prevents authorization code
  interception.
- `state` parameter: CSRF protection.
- Client discovery: authorization endpoint fetches `client_id` URL to verify
  `redirect_uri`, preventing open redirect attacks.
- URL canonicalization: the `me` URL must match what was entered.

**Server state:** user accounts, issued authorization codes (short-lived,
single-use), optionally access tokens.

**Strengths:** URL-as-identity is human-readable and discoverable. Fully
decentralized — anyone can run their own authorization endpoint. Built on proven
OAuth 2.0 machinery. Identity URL and auth server can be different.

**Weaknesses:** Relies on DNS/TLS for identity binding — no cryptographic proof
of identity beyond TLS. Actual authentication method is unspecified. No key
exchange or encryption. Only works in interactive browser contexts.

#### DID Auth (Decentralized Identity)

**Flow:**

1. Relying party sends a challenge (nonce + domain + timestamp) requesting proof
   of control of a DID.
2. User's agent resolves its own DID Document (e.g. `did:web` resolves to
   `https://domain/.well-known/did.json`).
3. User signs the challenge using a private key corresponding to a
   `verificationMethod` listed in the DID Document, producing a Verifiable
   Presentation.
4. RP resolves the user's DID Document independently, extracts the public key,
   and verifies the signature.
5. RP checks nonce freshness, domain binding, and timestamp.

**Security mechanisms:**

- Decentralized resolution: DID Document is the source of truth for public keys.
- Challenge nonce: prevents replay.
- Domain binding: challenge includes the RP's domain; signature covers it.
- Key rotation: DID Documents can be updated to rotate keys.
- Verification method specificity: DID Document declares which keys are valid
  for which purpose (authentication, assertion, key agreement).

**Server state:** minimal — the RP stores the DID string and a nonce
(ephemeral). Key material is resolved on-demand from the DID Document.

**Strengths:** Cryptographic proof of identity without shared secrets. Works
across domains naturally. Supports key rotation. `did:web` maps cleanly to
domain-based identity. Verifiable Presentations can bundle claims alongside
authentication.

**Weaknesses:** Ecosystem fragmentation — dozens of DID methods with different
trust models. Complexity: DID Documents, VCs, VPs, JSON-LD contexts — enormous
specification surface. No standardized browser integration. The specs are large
and loosely coupled.

### Analysis: what applies to KeyPears

| Aspect              | WebAuthn                | IndieAuth             | DID Auth                       | KeyPears Auth                  |
| ------------------- | ----------------------- | --------------------- | ------------------------------ | ------------------------------ |
| Identity format     | Opaque credential ID    | URL                   | DID URI                        | `name@domain`                  |
| Challenge-response  | Authenticator signs     | OAuth code exchange   | Signed VP                      | P-256 ECDSA                    |
| Phishing resistance | Strong (origin-bound)   | Moderate (PKCE+state) | Moderate (domain in challenge) | Moderate (domain in challenge) |
| Federation          | None                    | Via URL discovery     | Via DID resolution             | Via `keypears.json`            |
| Server state        | Public key + sign count | Auth codes + tokens   | Nonce only                     | Challenge nonce                |
| Key discovery       | Local only              | None (no crypto keys) | DID Document                   | Federation API                 |
| Browser integration | Native API              | Redirect flow         | None standard                  | Redirect flow                  |

#### What we take from WebAuthn

1. **P-256 challenge-response pattern**: identical primitive — sign a challenge
   with a private key, verify against a public key. WebAuthn validates this
   approach is battle-tested.
2. **Origin/domain binding in the signed payload**: WebAuthn embeds the origin
   in `clientDataJSON` which gets signed. KeyPears Auth should similarly bind
   the requesting app's domain into the challenge data so the signature is
   contextually bound.

#### What we take from IndieAuth

1. **User enters an identifier to start the flow**: IndieAuth's UX begins with
   the user typing their URL, then discovery happens. KeyPears Auth begins with
   the user typing their address, then `keypears.json` discovery happens. Same
   pattern.
2. **Decoupled identity and auth server**: in IndieAuth, your URL can point to
   any authorization endpoint. In KeyPears, your address domain can point to any
   API domain via `keypears.json`. Same separation.

#### What we take from DID Auth

1. **This is the closest structural analog.** KeyPears addresses function like
   DIDs with a `did:web`-like resolution model. The `keypears.json` file serves
   the same role as a DID Document — it tells you where to find endpoints and
   keys. The P-256 keys in `user_keys` are analogous to `verificationMethod`
   entries.
2. **Challenge includes RP domain**: DID Auth binds the challenge to the relying
   party's domain. We should do the same — the challenge payload should include
   the third-party app's origin, preventing cross-site reuse.
3. **Minimal server state**: DID Auth is nearly stateless on the RP side — just
   a nonce. KeyPears Auth can achieve the same.

#### What we explicitly reject

- **WebAuthn's RP-scoped credentials**: in WebAuthn, each credential is bound to
  one RP and invisible to others. KeyPears uses one persistent key pair across
  all apps — the address IS the identity, and cross-site correlation is a
  feature (your address is public).
- **IndieAuth's code exchange**: IndieAuth requires a server-to-server code
  exchange (inherited from OAuth). KeyPears Auth uses direct signature
  verification — no intermediate code, no token endpoint.
- **DID's specification complexity**: DID Documents, Verifiable Credentials,
  JSON-LD — we achieve the same with `keypears.json` + a single federation
  endpoint for public key lookup.

### Conclusion

KeyPears Auth is essentially **simplified DID Auth with IndieAuth's UX and
WebAuthn's signing primitive**:

- Email-like addresses instead of DID URIs
- `keypears.json` instead of DID Documents
- Browser redirects instead of custom wallet protocols
- Direct P-256 signature verification instead of Verifiable Presentations
- No specification stack — one JSON file, one redirect, one signature

The protocol design should include the requesting app's domain in the signed
challenge payload (from WebAuthn and DID Auth), use a redirect flow starting
from an address input (from IndieAuth), and verify signatures against
discoverable public keys (from DID Auth).

### Result: Pass

Survey complete. All five protocols examined. The design direction is confirmed
from multiple angles: KeyPears Auth is a new protocol that takes the best of
each without inheriting their complexity. Ready to design the full protocol
specification.

## Experiment 3: Design the `/sign` page and sign-in flow

### Goal

Design the complete sign-in flow including the `/sign` page on the KeyPears
server, the domain-only input on the third-party app, and the identity selection
UX.

### Key design decisions

#### Domain-only input (not full address)

On the third-party app, the user types only their address domain (e.g.
`example.com` — the part after `@` in their KeyPears address), not their full
address (`alice@example.com`). The app fetches
`example.com/.well-known/keypears.json` to discover the `apiDomain` (which may
be `example.com` itself, `keypears.example.com`, `keypears.com`, or any other
domain), then redirects to that API domain. This has two advantages:

1. **Privacy**: the third-party app does not learn the user's identity until the
   user explicitly chooses to reveal it on the KeyPears side. The app only knows
   the address domain and the API domain, not the user's name.
2. **Identity selection**: on the KeyPears `/sign` page, the user can choose
   which identity to present — their primary address, an existing alternate, or
   a brand-new address created just for this app.

The app learns the user's address only after the user signs and is redirected
back. The address is part of the signed payload, so the app can trust it.

#### No API keys

OAuth requires client registration (client_id, client_secret) because the
authorization server needs to know which apps may redirect users. This is
impractical in a federated system — you cannot register with every KeyPears
server, just as you cannot get an API key for every email server.

KeyPears Auth is registration-free by design. The structured signing payload is
self-validating: the P-256 signature proves the user approved it, and the
payload fields (domain, address, nonce, expires) provide all the context needed
for verification. The KeyPears server does not need to know the third-party app
in advance.

#### Identity selection on the `/sign` page

When the user arrives at `/sign`, they are already logged in (or prompted to log
in). The page shows:

1. **The signing request**: which app is asking, what type of action (sign-in),
   when it expires.
2. **Identity picker**: a list of the user's addresses on this server. The user
   can select any existing address or create a new one.
3. **Create new address**: generates a new identity specifically for this app.
   This is like email aliases but real — each address has its own key pair. If
   the app is compromised, burn the address with zero impact on the primary
   identity.

Creating a new address requires PoW (account creation difficulty). This is a
potential business model: servers can offer paid tiers that waive PoW for
sub-identity creation.

### Protocol flow

```
Third-party app (rssanyway.com)          User's browser          API server (keypears.example.com)
──────────────────────────────────────────────────────────────────────────────────────────────────

1. User types "example.com"
   in the domain field

2. App fetches
   example.com/.well-known/keypears.json
   → {"apiDomain": "keypears.example.com"}

3. App generates:
   - nonce (32 bytes, hex)
   - state (32 bytes, stored in session)
   Redirects browser to:
   https://keypears.example.com/sign?
     type=sign-in&
     domain=rssanyway.com&
     nonce=abc123...&
     expires=2026-04-21T12:10:00Z&
     redirect_uri=https://rssanyway.com/auth/callback&
     state=xyz789...

                                         4. Browser arrives at /sign
                                            User is logged in (or logs in now)

                                                                  5. Server validates:
                                                                     - type is known
                                                                     - expires is in the future
                                                                     - redirect_uri is HTTPS
                                                                     Renders consent screen:
                                                                     "rssanyway.com wants to
                                                                      verify your identity"

                                         6. User selects identity:
                                            - alice@example.com (existing)
                                            - or creates a new address

                                         7. User clicks "Approve"
                                            Browser constructs the
                                            signing payload:
                                            {
                                              type: "sign-in",
                                              domain: "rssanyway.com",
                                              address: "alice@example.com",
                                              nonce: "abc123...",
                                              timestamp: "2026-04-21T12:00:00Z",
                                              expires: "2026-04-21T12:10:00Z"
                                            }
                                            Signs with P-256 private key

                                         8. Browser redirects back to:
                                            https://rssanyway.com/auth/callback?
                                              signature=base64...&
                                              address=alice@example.com&
                                              nonce=abc123...&
                                              state=xyz789...

9. App verifies:
   - state matches session
   - nonce matches what it sent
   - expires is still in the future
   - discovers example.com's apiDomain
     via keypears.json
   - fetches alice@example.com's
     public key via federation API
   - verifies P-256 signature over
     the reconstructed payload
   → User is alice@example.com
     Session created.
```

### Signing payload schema: `sign-in`

```json
{
  "type": "sign-in",
  "domain": "rssanyway.com",
  "address": "alice@example.com",
  "nonce": "a1b2c3d4e5f6...",
  "timestamp": "2026-04-21T12:00:00Z",
  "expires": "2026-04-21T12:10:00Z"
}
```

| Field       | Source          | Description                                    |
| ----------- | --------------- | ---------------------------------------------- |
| `type`      | Third-party app | Always `"sign-in"` for authentication          |
| `domain`    | Third-party app | Origin domain of the requesting app            |
| `address`   | User (on /sign) | The KeyPears address the user chose to present |
| `nonce`     | Third-party app | Random value for replay prevention             |
| `timestamp` | KeyPears server | When the signing occurred                      |
| `expires`   | Third-party app | When the signed payload stops being valid      |

The payload is serialized as canonical JSON (sorted keys, no whitespace) before
signing to ensure both sides produce the same bytes.

### Redirect parameters

**To `/sign`** (query params):

| Param          | Required | Description                          |
| -------------- | -------- | ------------------------------------ |
| `type`         | yes      | Signing template type (`sign-in`)    |
| `domain`       | yes      | Requesting app's origin domain       |
| `nonce`        | yes      | Random hex string (min 32 bytes)     |
| `expires`      | yes      | ISO 8601 timestamp                   |
| `redirect_uri` | yes      | Where to bounce back (must be HTTPS) |
| `state`        | yes      | Opaque value for CSRF protection     |

**Callback** (query params):

| Param       | Description                                    |
| ----------- | ---------------------------------------------- |
| `signature` | Base64url-encoded P-256 ECDSA signature        |
| `address`   | The KeyPears address the user chose            |
| `nonce`     | Echo of the original nonce                     |
| `state`     | Echo of the original state (CSRF verification) |

### Verification steps (third-party app)

1. Verify `state` matches the value stored in the user's session.
2. Verify `nonce` matches what was originally sent.
3. Check `expires` is still in the future.
4. Reconstruct the signing payload from the known fields (type, domain, address,
   nonce, timestamp, expires).
5. Fetch the user's public key: discover `address`'s domain via `keypears.json`,
   then call the federation API to get the public key.
6. Verify the P-256 ECDSA signature over the canonical JSON payload.
7. Create a session for the authenticated user.

### Security properties

- **No API keys**: the KeyPears server does not need to know the third-party app
  in advance. Any HTTPS origin can initiate the flow.
- **CSRF protection**: `state` parameter, same as OAuth.
- **Replay prevention**: `nonce` is single-use (the app tracks used nonces) and
  `expires` bounds the window.
- **Identity privacy**: the app only learns the user's address after the user
  explicitly selects it on the `/sign` page.
- **Per-app identities**: users can create throwaway addresses for untrusted
  apps, limiting exposure.
- **No phishing amplification**: the `/sign` page runs on the user's own
  KeyPears server. The user must already be logged in. A phishing site cannot
  obtain a valid signature without the user's active participation on a
  legitimate KeyPears server.
- **Redirect URI validation**: the KeyPears server enforces HTTPS on the
  `redirect_uri`. Open redirect attacks are limited because the signature is
  bound to the `domain` field, not the redirect URI — even if redirected to a
  different URL, the signature only validates for the original domain.

### `/sign` page UI

The page has three states:

**1. Not logged in**: show the standard KeyPears login form. After login,
proceed to the consent screen.

**2. Consent screen** (logged in):

```
┌──────────────────────────────────────────┐
│  rssanyway.com wants to verify           │
│  your identity                           │
│                                          │
│  Sign in as:                             │
│                                          │
│  ○ alice@example.com                     │
│  ○ bob@keypears.com                      │
│  ○ Create new address...                 │
│                                          │
│  Expires: 10 minutes                     │
│                                          │
│  [ Approve ]          [ Deny ]           │
└──────────────────────────────────────────┘
```

**3. Create new address** (expanded):

```
┌──────────────────────────────────────────┐
│  Create a new address for rssanyway.com  │
│                                          │
│  ┌──────────────────┐ @keypears.com      │
│  │ ________________ │                    │
│  └──────────────────┘                    │
│                                          │
│  ⚡ Proof of work required (~15s)        │
│                                          │
│  [ Create & Sign In ]     [ Back ]       │
└──────────────────────────────────────────┘
```

### What the third-party app needs to implement

1. A domain input field on the login page.
2. A server-side handler to initiate the flow: generate nonce + state, store in
   session, redirect to the KeyPears server's `/sign`.
3. A callback handler (`/auth/callback`): verify state, nonce, expires, fetch
   public key, verify signature, create session.

This is the surface area for the `@keypears/auth` client library.

### Result: Pending

Design complete. Next step is implementation.
