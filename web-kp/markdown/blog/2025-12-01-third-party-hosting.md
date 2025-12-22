+++
title = "Third-Party Hosting: Making KeyPears as Easy as Hosted Email"
date = "2025-12-01T12:00:00-06:00"
author = "KeyPears Team"
+++

Imagine you own `example.com`. You run your own website there, but you don't run
your own email server—Gmail or Fastmail handles that for you. Your email address
is still `you@example.com`, but Google or Fastmail does the heavy lifting of
running the mail servers, managing spam, and keeping everything online.

What if password management worked the same way?

Today we shipped the foundation for exactly that: the ability to point your
domain's KeyPears protocol at any third-party hosting provider. It's a
proof-of-concept, but it works—and it brings us one step closer to making
decentralized password management as easy as hosted email.

## Why Decentralization Matters

Email is one of the internet's great success stories in federated architecture.
Anyone can run an email server. Gmail users can email ProtonMail users who can
email self-hosted server users. There's no central authority deciding who gets
to participate. The protocol is open, the address format is universal, and
interoperability is the default.

KeyPears borrows this architecture, but improves on it in a critical way:
**end-to-end encryption by default**. When `alice@keypears.com` shares a secret
with `bob@company.com`, the servers never see the plaintext. They're just
coordinators—dumb pipes that route encrypted blobs between clients that hold the
real keys.

The address format mirrors email intentionally. Your vault is
`yourname@yourdomain.com`. You can use our hosted service at `keypears.com`, run
your own server, or—with what we built today—point your domain at any KeyPears
hosting provider you trust.

This means companies with different domains and different service providers can
still share secrets securely. Marketing at `acme.com` (hosted by Provider A) can
share API keys with engineering at `partner.io` (self-hosted) using the same
Diffie-Hellman key exchange that makes the whole system work.

## The `.well-known/keypears.json` Protocol

The implementation is simple. Domain owners create a file at
`/.well-known/keypears.json` that tells clients where to find the API:

```json
{
  "version": 1,
  "apiUrl": "https://keypears.com/api"
}
```

That's it. When a KeyPears client needs to interact with vaults at
`example.com`, it fetches `https://example.com/.well-known/keypears.json`, reads
the `apiUrl`, and directs all API calls there.

If you're running your own server, the `apiUrl` points to yourself:

```json
{
  "version": 1,
  "apiUrl": "https://example.com/api"
}
```

If you're using a third-party host like `keypears.com`:

```json
{
  "version": 1,
  "apiUrl": "https://keypears.com/api"
}
```

The pattern follows the established convention of `.well-known` files that power
everything from SSL certificate validation (`.well-known/acme-challenge`) to
security contact information (`.well-known/security.txt`). It's a proven
approach for domain-level configuration.

## What We Built Today

This week we implemented the complete infrastructure for this feature:

**In the library (`@keypears/lib`):**

- A Zod schema (`KeypearsJsonSchema`) that validates the `keypears.json` format
- A `buildBaseUrl()` helper for constructing domain URLs

**In the API server (`@keypears/api-server`):**

- Updated `validateKeypearsServer()` to parse and return the `apiUrl`

**In the webapp (`@keypears/webapp`):**

- A dynamic React Router resource route that serves `keypears.json`
- Environment-aware configuration (production vs development URLs)

**In the Tauri app (`@keypears/tauri-ts`):**

- `fetchApiUrl()` function that retrieves and caches API URLs from `keypears.json`
- Updated all API client calls to use the discovered URL instead of constructing it

The key insight is that clients no longer assume the API lives at
`https://domain.com/api`. They discover it dynamically. This single change
enables the entire third-party hosting model.

## What's Still Needed

We want to be transparent: this is a proof-of-concept, not a production-ready
feature. There's a critical missing piece.

**The problem:** Right now, anyone could create a `keypears.json` file claiming
that `keypears.com/api` hosts vaults for `example.com`. There's no verification
that the owner of `example.com` actually authorized this.

**The solution:** Before launch, we'll add a public key (or public key hash) to
the `keypears.json` file. The domain owner will need to prove they control this
key, likely through a challenge-response protocol or by publishing the key in
DNS. This cryptographic proof ensures that only the legitimate domain owner can
authorize a hosting provider.

The future format might look like:

```json
{
  "version": 2,
  "apiUrl": "https://keypears.com/api",
  "domainPubKeyHash": "a1b2c3d4..."
}
```

We haven't implemented this yet because the current proof-of-concept is
sufficient for development and testing. The infrastructure is in place; the
authentication layer comes next.

## The Bigger Picture

KeyPears is building toward a world where password management works like email
should have worked from the start: decentralized, interoperable, and encrypted
by default.

- **Decentralized:** No single company controls the network. Run your own server
  or choose a provider you trust.
- **Interoperable:** `alice@keypears.com` can share secrets with
  `bob@selfhosted.org` seamlessly.
- **End-to-end encrypted:** Servers are dumb coordinators. They never see your
  passwords, your keys, or your plaintext secrets.
- **Self-custody with convenience:** You control your keys, but you get the sync
  and sharing features of cloud-based managers.

The third-party hosting feature is a key piece of this puzzle. It means you
don't have to choose between running your own infrastructure and using someone
else's domain. You can have your cake and eat it too: your domain, your
identity, someone else's servers.

## What's Next

With third-party hosting infrastructure in place, our next priority is the
Diffie-Hellman key exchange protocol for secure secret sharing between users.
This is the feature that makes KeyPears more than just a password manager—it's
what enables `alice@company.com` to securely share credentials with
`bob@partner.io` without either server ever seeing the plaintext.

After DH key exchange, we'll focus on:

- Multi-domain support (official KeyPears domains beyond `keypears.com`)
- Domain ownership verification (the public key piece mentioned above)
- Payment and business model (freemium with premium custom domain hosting)

The architecture is coming together. Each piece we build makes the next piece
possible. Today's proof-of-concept becomes tomorrow's production feature.

If you're interested in following our progress, the code is open source and
available on [GitHub](https://github.com/keypears/keypears). We're building in
public because we believe the best security software is software you can verify.

_Next up: Diffie-Hellman key exchange for cross-user secret sharing. Stay
tuned!_
