+++
title = "Announcing KeyPears Alpha"
date = "2026-04-12T18:00:00-06:00"
author = "Ryan X. Charles"
+++

KeyPears is in alpha, live at [keypears.com](https://keypears.com), and the
entire stack is open source on [GitHub](https://github.com/keypears/keypears)
under MIT. KeyPears is a federated end-to-end encrypted protocol for messaging
and secret storage. Your identity is an email-style address (`alice@keypears.com`)
backed by a NIST P-256 key pair. Servers store only ciphertext.

This post explains what KeyPears is, why we built it, and what you can do
with it today.

## What email got right, and what it got wrong

Internet communication has relied on email for over forty years. Email got two
things right: human-readable addresses (`name@domain`) and federation via DNS.
Any domain can run a mail server, and servers find each other through MX
records. That's how email achieved universal reach without central control.

Email got two things wrong, and four decades of effort haven't fixed them.

**It has no key exchange.** PGP tried. Whitten and Tygar showed in 1999 that
the majority of test users couldn't successfully encrypt a message even after
ninety minutes with PGP 5.0 — and a generation later, encrypted email is still
a niche practice. The cryptography wasn't the problem. The user interface was.
Key generation, key exchange, trust decisions, and revocation are concepts
that don't map onto any familiar workflow.

**It has no cost to send.** Spam is economically rational because delivery is
free. Adam Back proposed Hashcash in 1997 — a small computational cost on each
message — but SMTP has no way to negotiate proof of work between sender and
recipient, and you can't make it mandatory without losing every legitimate
sender who hasn't heard of it.

The centralized alternatives took a different bargain. Signal solved
end-to-end encryption for billions of users with a single software update,
but at the cost of phone-number identity controlled by carriers and a single
company running every server. Matrix is federated and end-to-end encrypted,
but it threw out email-compatible addresses (`@user:server`) and built a
directed acyclic graph of room state synchronized across homeservers — a
conceptually rich system that's hard to operate. Keybase combined social-proof
identity with end-to-end messaging, then was acquired by Zoom and effectively
shut down — a cautionary case for centralized hosting of decentralization-aspirational
products.

We wanted what email got right *and* what email got wrong, in one protocol,
mandatory from day one.

## What KeyPears is

KeyPears is a clean-sheet protocol that keeps `name@domain` addressing and
DNS-based federation while making Diffie-Hellman key exchange and proof of
work first-class requirements:

- **Identity is `name@domain`.** Same format as email. If you own your domain,
  you own your identity. No phone number, no central registry, no proprietary
  identifier. The address `alice@acme.com` survives changes in hosting
  provider — only the `keypears.json` configuration file changes.

- **End-to-end encrypted by default.** Every message and every vault entry is
  encrypted client-side with AES-256-GCM under a key derived via ECDH on NIST
  P-256. The server stores only ciphertext and never possesses the keys to
  decrypt it. Compromise of the server reveals nothing.

- **Boring cryptography, on purpose.** Every primitive is NIST-approved:
  SHA-256, HMAC-SHA-256, PBKDF2-HMAC-SHA-256 (1.2 million total rounds,
  including 600,000 on the server alone), AES-256-GCM, P-256 ECDH and ECDSA.
  Nothing novel, nothing creative — exactly the same primitives that secure
  TLS, WebAuthn, and every smartcard on Earth. A reviewer opening the crypto
  layer should find it boring. Boring is the goal.

- **Proof of work for spam resistance.** Every account creation, login, and
  message requires a proof of work computed client-side via the `pow5-64b`
  algorithm, designed for efficient GPU execution. Difficulty is configurable
  per server (account creation, login) and per user (first contact, ongoing
  conversation). PoW handles application-level abuse at the points that
  matter. No CAPTCHAs, no third-party verification.

- **Pull-model federation.** When `alice@a.com` sends a message to
  `bob@b.com`, her server stores the ciphertext and notifies Bob's server with
  a pull token. Bob's server independently resolves Alice's domain via DNS
  and TLS and pulls the ciphertext using the token. No server-to-server
  signing keys, no new PKI — domain authentication piggybacks on the same
  HTTPS trust model the rest of the web already uses.

If you want the full protocol design, cryptographic construction, federation
model, and security analysis, the [whitepaper](https://keypears.com/keypears.pdf)
covers it in about a dozen pages.

## What runs today

At [keypears.com](https://keypears.com) you can:

- Create an account (PoW-gated, no email verification, no phone number)
- Send and receive end-to-end encrypted messages with anyone on any KeyPears
  server
- Store secrets in an encrypted vault — passwords, credentials, notes, all
  encrypted client-side under a key derived from your private key
- Rotate your P-256 key pair (up to 100 keys per account, with per-key
  passwords for fine-grained recovery)
- Claim a custom domain by hosting a `keypears.json` file at the well-known
  path
- Manage users on a domain you've claimed, as the verified admin

The [docs](https://keypears.com/docs) walk through addressing, key derivation,
encryption, proof of work, federation, self-hosting, and the security model.
If you're the kind of person who reads the protocol page before signing up,
that's where to start.

## Open source from day one

KeyPears is MIT licensed. Every line of code is on
[GitHub](https://github.com/keypears/keypears), including:

- The webapp itself (TanStack Start, Bun, MySQL via Drizzle, React 19)
- The proof-of-work algorithm (`pow5-64b`, Rust → WASM with TypeScript bindings)
- The whitepaper source (Typst)
- The Terraform stack that runs the production server (VPC, ALB, ECS Fargate,
  WAF, ECR, Route53)
- The deploy script
- Every blog post, including this one

You can run your own KeyPears server today. Fork the repository, change the
domain in your environment, change the title of the app to whatever you want,
and deploy. Two domains can already federate with each other and exchange
end-to-end encrypted messages — that's the model and it works in production.

If you want to claim a domain you already own without running a server, host a
`/.well-known/keypears.json` pointing at any KeyPears server, and create your
account there. The address `alice@yourdomain.com` is yours; the hosting is
just configuration, and you can move it later.

## A note about alpha

KeyPears is in alpha. The protocol has been audited internally multiple times,
the cryptographic primitives are exclusively NIST-approved, and the security
model is documented in detail. Every significant decision, including the move
back to NIST-only primitives and the rewrite to the current architecture, has
been written up on this blog. **We do not plan to wipe the database.** But:

If a fundamental flaw is discovered in the protocol — something that can't be
fixed by a code update without re-deriving everyone's keys or invalidating
everyone's stored messages — we may have no choice but to wipe the database
and start over. The alpha label is a precaution, not a prediction. We are
warning everyone up front so that no one builds a critical workflow on
KeyPears under the assumption that the data will outlive this phase.

When we are confident there are no fundamental flaws — measured in months of
operation under real load with continued review — we will remove the alpha
flag and the warning that comes with it. Until then, treat KeyPears as a
system you can rely on for messaging and secret storage *most of the time*,
with the caveat that the floor could fall out exactly once. **Don't store the
only copy of anything you can't afford to recreate.**

Everything we've shipped is in service of making that scenario unlikely. The
decision to use only NIST primitives, to layer end-to-end encryption inside
TLS, to make the server store only ciphertext, to rebuild the codebase from
scratch on a clean foundation — all of it exists so that the alpha flag
eventually comes off and the database keeps running.

## Where to go

- **Try it**: [keypears.com](https://keypears.com)
- **Read the docs**: [keypears.com/docs](https://keypears.com/docs)
- **Read the whitepaper**: [keypears.com/keypears.pdf](https://keypears.com/keypears.pdf)
- **Read the source**: [github.com/keypears/keypears](https://github.com/keypears/keypears)
- **Run your own**: clone the repo, follow `infra/README.md`

If you self-host a KeyPears node and federate with `keypears.com`, you're
directly testing the federation layer in production. That's the most useful
thing you can do for the project right now. If you find a bug, file it on
GitHub. If you find a cryptographic flaw, please email me directly first.

## Why this matters

Email demonstrated that federated, human-readable addressing can achieve
universal reach without central control. But email's design assumed trusted
networks, and four decades of effort have failed to retrofit the two things
it lacks. Centralized alternatives solved encryption and spam by abandoning
federation and trading sovereignty for convenience.

KeyPears takes the third path: a clean-sheet protocol that preserves
`name@domain` addressing and DNS-based federation while making Diffie-Hellman
key exchange and proof of work mandatory from the start. Encryption is the
only mode. Spam is computationally expensive. No single entity controls
identity. The cryptography is boring. The protocol is documented. The code
is open. The alpha is live.

Thank you for reading this far. If you're the kind of person who'd reach the
end of a post like this one, you're exactly the kind of person who should try
KeyPears, run a node, read the whitepaper, and tell us what we got wrong.

— Ryan
