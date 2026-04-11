+++
title = "The KeyPears Rewrite"
date = "2026-04-11T12:00:00-07:00"
author = "Ryan X. Charles"
+++

We rewrote KeyPears from scratch. The previous codebase — React Router,
PostgreSQL, Tauri, Catppuccin theme — taught us what KeyPears needed to be. But
the architecture couldn't get us where we needed to go. So we started over.

Here's what changed and why.

## Why we rewrote

The original KeyPears (which we now call "kp1") was a monorepo with six
packages: a TypeScript library, an oRPC API client and server, a Tauri native
app, and two web apps. It worked, but every feature required changes across
multiple packages, and the Tauri native app added a Rust build step that slowed
everything down.

The rewrite collapses all of that into a single TanStack Start application.
TanStack Start gives us server-side rendering and single-page app behavior in
one framework — no separate API server, no separate client package, no Rust.
Server functions replace the oRPC contract layer with direct database access
behind type-safe RPC calls.

We also switched from PostgreSQL to MySQL. The deployment target is PlanetScale,
which runs Vitess — a horizontally sharded MySQL system designed for tables that
grow without bound. Our PoW replay table, message history, and audit logs are
exactly that kind of data.

The Tauri native app is gone. The browser is the platform. WebGPU gives us GPU
access for proof of work. The Web Crypto API and our WebAssembly libraries
handle all cryptography. A native app may return someday, but the web app is
the product.

## What changed

### BLAKE3 everywhere

The kp1 codebase used SHA-256 for hashing and HMAC-SHA256 for message
authentication. The rewrite uses BLAKE3 for everything:

- **Key derivation**: Three-tier BLAKE3 PBKDF (100k rounds per tier, 300k total
  from password to stored hash)
- **Authenticated encryption**: ACB3 (AES-256-CBC with BLAKE3-MAC) replaces ACS2
  (AES-256-CBC with HMAC-SHA256)
- **Challenge signing**: PoW challenges are signed with BLAKE3-MAC
- **Session tokens**: Hashed with BLAKE3

BLAKE3 is faster than SHA-256 on modern hardware and has a cleaner API — keyed
MAC mode is built in, no HMAC construction needed. Using one hash function
everywhere simplifies the security analysis.

### WebGPU proof of work

Every account creation, login, and message requires proof of work. The pow5-64b
algorithm runs natively on the GPU via WebGPU — no WebAssembly, no CPU mining.
On a modern laptop GPU, difficulty 70M takes about 1–2 seconds.

Difficulty is not fixed by the protocol. Server operators set the difficulty for
account creation and login. Individual users set the difficulty for incoming
messages. Getting too much spam? Raise your difficulty. Under a brute-force
attack? The operator raises login difficulty. The protocol provides the
mechanism; operators and users choose the policy.

### Pull-model federation

When Alice on `a.com` sends a message to Bob on `b.com`, the delivery works like
this:

1. Alice's server stores the ciphertext and creates a pull token
2. Alice's server notifies Bob's server
3. Bob's server independently resolves `a.com` via DNS/TLS
4. Bob's server pulls the ciphertext using the token

The pull happens synchronously — Alice gets immediate confirmation of delivery
or an immediate error. No outbox queue, no silent retry, no delayed bounce
notification days later.

Domain verification comes from TLS, not server signing keys. Bob's server
resolves Alice's domain itself and trusts the HTTPS response. No certificate
authority, no key exchange between servers, no new trust infrastructure.

### Vault versioning

Editing a vault entry now creates a new version instead of overwriting. Every
version is immutable and browsable. Accidentally overwrite a password? The old
value is still there.

### Email-compatible addresses

KeyPears addresses are `name@domain` — intentionally identical to email
addresses. The protocol places no restrictions on the local part beyond what
email allows. If you have email addresses at your domain, those same addresses
work with KeyPears. You can't do this with Matrix (`@user:domain`) or Signal
(phone numbers).

## The whitepaper

We've published a draft of the KeyPears whitepaper: "KeyPears: Federated Secret
Exchange." It's 8 pages covering the protocol design, cryptographic
construction, federation model, and security analysis — with empirically
verified quantitative claims. This is a working draft and will evolve before the
final release.

The introduction frames KeyPears as what email would be if it were designed
today: same `name@domain` addressing and DNS-based federation, but with
Diffie-Hellman key exchange for end-to-end encryption and proof of work for spam
mitigation. Both are mandatory from day one, not retrofitted onto a protocol
that was never designed for them.

Read it at [keypears.com/keypears.pdf](https://keypears.com/keypears.pdf).

## Documentation and blog

Documentation lives at [/docs](/docs), fully integrated into the app. Protocol
details, federation mechanics, self-hosting guide, security analysis — all
accessible without logging in, using the same components and navigation as the
rest of the application.

The blog you're reading right now was imported from kp1 with all URLs preserved.
Every old post is still accessible at its original address. RSS, Atom, and JSON
feeds are generated at build time.

## What's next

Launch. The protocol is designed. The whitepaper is published. The app works.
The documentation is written. We're preparing for public launch of
keypears.com.

If you want to follow along, subscribe to the [RSS feed](/blog/feed.xml) or
check back here.
