+++
title = "Sign In With Your Address: Why KeyPears is Building a New Auth System"
date = "2026-04-20T12:00:00-06:00"
author = "Ryan X. Charles"
+++

Every new app you sign up for presents the same depressing choice: create
another password you'll forget, hand your identity to Google, or wait for a
six-digit code to arrive in your inbox. We've been choosing between these
options for twenty years. None of them are good.

Passwords don't scale. The average person has over a hundred online accounts.
Password managers help, but they're a patch on a broken model — you're still
creating a new credential for every service, and the service is still storing a
hash that can be breached.

"Sign in with Google" is convenient until you realize you've made a corporation
the root of your digital identity. Google decides you violated a policy you've
never read, and suddenly you can't log into your bank, your project management
tool, your email. Centralized identity providers are a single point of failure
dressed up as a feature.

Email OTP is the compromise everyone settled on. It's slow (you wait for the
email), phishable (the code can be intercepted), and requires the app to run
email infrastructure or pay for a service. It works. It's also a hack — we're
using a forty-year-old messaging system as an authentication side channel
because we never built anything better.

## What if you already had the answer?

Here's the thing: if you have a KeyPears account, you already have everything
you need to prove your identity to any application on the internet.

You have an address: `alice@example.com`.

You have a P-256 key pair. Your private key lives in your browser, encrypted.
Your public key is discoverable by anyone who knows your address.

You can sign things.

So why can't you just type your address into any app, sign a challenge, and be
authenticated? No new password. No email. No Google. No waiting.

That's what we're building.

## Why not OAuth?

[OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) is the dominant
redirect-based authentication protocol on the web. "Sign in with GitHub," "Sign
in with Google" — that's OAuth. It works. It's also solving the wrong problem.

OAuth was designed for **delegated authorization**: "Let this app read my GitHub
repos." It answers the question "what can this app do?" not "who is this
person?" [OpenID Connect](https://openid.net/specs/openid-connect-core-1_0.html)
bolts an identity layer on top, but the underlying machinery — client
registration, client secrets, token endpoints, refresh tokens, scopes — remains.

The critical problem: **OAuth requires pre-registration.** Before your app can
authenticate users via GitHub, you must register with GitHub, get a client ID
and secret, and configure redirect URIs. This works when there are a handful of
identity providers. It fails completely in a federated system where any domain
can run a server. You can't require every app to pre-register with every
possible KeyPears server on the internet.

OAuth's redirect flow is elegant. We're keeping that. Everything else — client
registration, tokens, scopes, refresh flows — is baggage from a different
problem.

## Why not WebAuthn?

[WebAuthn](https://www.w3.org/TR/webauthn-3/) (the technology behind passkeys
and hardware security keys) is excellent at what it does: phishing-resistant
authentication using asymmetric cryptography. The browser mediates the signing,
the credential is bound to the origin, and no shared secret ever touches a wire.

But WebAuthn credentials are **device-bound and RP-scoped**. Your passkey for
GitHub is invisible to every other site. Each relying party gets its own
credential. There's no federation story — you can't take your WebAuthn identity
and prove who you are to a new app without registering a new credential there
first.

WebAuthn answers "I'm the same person who registered on this site before." It
doesn't answer "I'm `alice@keypears.com` and I can prove it."

We want the signing primitive. We don't want the isolation.

## Why not DIDs?

[Decentralized Identifiers (DIDs)](https://www.w3.org/TR/did-1.1/) are the
closest existing work to what we need. A DID is a URI
(`did:web:example.com:alice`) that resolves to a DID Document — a JSON file
listing public keys and service endpoints. DID Auth is a challenge-response
protocol where you prove control of a DID by signing a challenge with the
corresponding private key.

This is almost exactly what we want. The problem is the specification stack.

DID Documents. Verifiable Credentials. Verifiable Presentations. JSON-LD
contexts. Proof formats. Resolution methods — there are over a hundred of them,
each with different trust models, different resolution mechanisms, different
levels of maturity.

The core idea is right: discoverable keys, challenge-response authentication,
federated identity. The execution is an enterprise specification committee's
fever dream. No normal developer is going to implement the full DID/VC stack to
add "sign in" to their app.

We need the substance without the ceremony.

## The KeyPears approach

Here's what authentication should look like in 2026:

**One address.** `alice@example.com`. Human-readable, memorable, federated —
just like email.

**One discovery file.** `https://example.com/.well-known/keypears.json` tells
any app where to find the server and the user's public key. One JSON file. No
specification stack.

**One redirect.** App sends the user to their KeyPears server with a challenge.
User approves. KeyPears server sends them back with a signature.

**One signature.** The app verifies the P-256 signature against the user's
public key. Done. Authenticated.

No registration. No tokens. No client secrets. No refresh flows. No scopes. No
email side channel. Any app can authenticate any user on any server, with zero
prior relationship between the app and the server.

## How it works

The flow has three steps:

**1. Discovery.** User types `alice@example.com` into the app's login field. The
app fetches `https://example.com/.well-known/keypears.json`, finds the user's
API domain (e.g. `keypears.example.com`), and knows where to send the user.

**2. Redirect and sign.** The app redirects the user to their KeyPears server —
`https://keypears.example.com/auth/sign` — with a challenge payload. The user
is already logged in (or logs in now). The server presents the challenge —
"rssanyway.com wants to verify your identity" — and the user approves. Their
browser signs the challenge with their P-256 private key.

The challenge isn't a raw string from the app — that would invite
vulnerabilities. Instead, the KeyPears server computes an HMAC over the app's
challenge using a server-side key, and the user signs that derived value. The
signed payload is meaningless outside this specific flow, unpredictable to the
app, and bound to the original challenge.

**3. Verify.** The user is redirected back to the app with the signature. The
app fetches the user's public key via the KeyPears federation API and verifies
the signature. If it checks out, the user is `alice@example.com`. Session
created. Done.

Total time: one redirect there, one redirect back. Faster than waiting for an
email. Simpler than managing OAuth tokens. More secure than a password.

## What this means

Any developer can add "Sign in with KeyPears" to their app by:

1. Adding an address input field.
2. Fetching a well-known JSON file.
3. Redirecting to a URL.
4. Verifying a signature on the callback.

No API keys. No developer portal. No registration with anyone. No rate limits.
No terms of service. If you can verify a P-256 signature, you can authenticate
KeyPears users.

This is what "sign in with email" should have been — if email had been designed
with cryptography from the start.

## What's next

We're building this now. [RSS Anyway](https://rssanyway.com) will be the first
third-party app to authenticate with KeyPears addresses. We'll publish the
protocol specification as a docs page, release a client library that any app can
import, and implement the server-side endpoints on KeyPears.

If you have a KeyPears account, your address will soon be your login everywhere.

---

If you want to follow along, the protocol design is happening in the open in our
[GitHub issues](https://github.com/keypears/keypears). If you want to try
KeyPears today, create an account at [keypears.com](https://keypears.com).
