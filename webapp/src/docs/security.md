KeyPears is designed to protect stored message bodies and vault contents from
database theft and passive server compromise. This page describes what the
system protects against, where the server is still trusted, and what remains
outside the protocol's goals.

## Server trust boundary

KeyPears deliberately keeps the federation model simple and email-like. A
domain's server is trusted to publish the correct current public keys for its
hosted addresses and to serve honest client code. If you do not trust a hosted
server in that role, the protocol answer is to host your own domain.

KeyPears does not try to protect future messages from an active server that
lies about public keys. Such a server can substitute attacker-controlled
X25519 and ML-KEM public keys for future sends and perform a man-in-the-middle
attack on those future messages. This is an intentional trust boundary, not a
missing key-transparency layer.

The improvement over email is the blast radius. A compromised email server can
read stored mail. A compromised KeyPears server cannot decrypt already-stored
application ciphertext unless it also obtains client-side keys, passwords, or
active client/session access.

## Database and passive server compromise

The server stores only ciphertext (messages, vault entries, encrypted private
keys) and hashed credentials (login key hashed with 600,000 additional rounds
of PBKDF2-HMAC-SHA-256, using a per-user salt derived from the user's ID). An
attacker who captures the database cannot read any user content.

To impersonate a user, the attacker must recover a valid login key. Brute
forcing the login key directly is infeasible — it is a uniformly random 256-bit
value, and the search space is 2^256. The only realistic attack is a dictionary
attack against the user's password. The conservative baseline is the
600,000-round server-side PBKDF2-HMAC-SHA-256 hash with a per-user salt. Before
that server check, the client also computes two deterministic 300,000-round
tiers to derive the login key from the password.

## Password brute-force

The server-side tier alone performs 600,000 rounds of PBKDF2-HMAC-SHA-256 on
every login key, matching the OWASP Password Storage Cheat Sheet
recommendation for PBKDF2-HMAC-SHA-256. For one target user, an offline
password guess must pass through the two client-side tiers and that user's
server-side tier. For attacks across many users, the first two client-side tiers
use deterministic protocol salts, so an attacker can reuse that work for the
same password candidate across users. The final 600,000-round server tier uses
a per-user salt derived from the user ID, so that server-side hashing work must
still be performed separately for each target user.

For an 8-character password drawn from lowercase letters and digits (36^8 ≈ 2.8
× 10^12 candidates), exhaustive search is computationally infeasible on any
realistic hardware budget. Longer or more complex passwords increase this cost
exponentially.

Online attacks are further throttled by the login PoW requirement (7M
difficulty per attempt) and by per-IP rate limiting at the infrastructure
layer.

## Spam and Sybil attacks

Every account creation, login, and message requires proof of work, and the
difficulty is tunable. The cost of an attack scales linearly with the number of
targets and with the difficulty level.

Operators can raise difficulty in response to attacks. Recipients who set high
message difficulty impose additional per-message costs that make targeted spam
impractical.

## Social-graph probing

Proof-of-work challenge requests for messaging are authenticated: the sender
must sign the request with a composite Ed25519 + ML-DSA-65 signature, and the
recipient's server verifies both signatures via federation.

An unauthenticated party cannot request a challenge, and therefore cannot probe
whether two users have a communication channel. Both addresses are signed into
the challenge payload, preventing cross-conversation reuse.

## Domain spoofing

The pull model prevents domain spoofing without any additional signing
infrastructure. When Bob's server receives a notification from Alice's domain, it
does not trust the notification's claimed origin. Instead, it independently
resolves Alice's domain via DNS and TLS, fetching `keypears.json` to discover
the API endpoint.

A malicious server cannot forge another domain's identity because TLS guarantees
the response came from the real domain.

Domain spoofing protection is not the same as no-trust key transparency. Once a
domain is resolved, that domain's KeyPears server remains the authority for its
users' current public keys.

## Client storage theft

KeyPears caches the encryption key in localStorage. A theft of localStorage
alone gives the attacker that cached encryption key, but it does not derive the
login key and does not by itself create a server session. The login key is a
cryptographic sibling of the encryption key (derived from the same parent with a
different salt), not a child.

If the attacker also obtains encrypted private-key blobs, the cached encryption
key can decrypt the user's Ed25519, X25519, ML-DSA, and ML-KEM private keys. If
the attacker also obtains an authenticated session, they may be able to fetch
those encrypted blobs from the server.

Active origin compromise is stronger than storage-only theft. Malicious script
or malware running as the KeyPears origin can combine session access, server
functions, the cached encryption key, and client-side crypto helpers to decrypt
signing keys and sign messages or third-party auth assertions as the user until
the session is revoked, keys are rotated, or the compromised client is cleaned.
This is a standard web-app endpoint compromise boundary, not a protocol
redesign trigger.

## Browser security headers

Every response from the KeyPears server includes a set of HTTP security headers
designed to reduce the impact of browser-level attacks:

- **Content-Security-Policy** — restricts which scripts, styles, images, and
  connections the browser will execute. KeyPears uses `default-src 'self'`, so
  resources can only load from the same origin. Inline scripts are permitted
  (`'unsafe-inline'`) because TanStack Start injects hydration data as inline
  tags. WASM execution is permitted (`'wasm-unsafe-eval'`) for the webbuf
  cryptographic primitives. Frame embedding is denied entirely
  (`frame-ancestors 'none'`).
- **X-Frame-Options: DENY** — prevents the site from being embedded in an
  iframe, blocking clickjacking.
- **X-Content-Type-Options: nosniff** — prevents browsers from MIME-sniffing
  responses, closing off a class of cross-content-type attacks.
- **Strict-Transport-Security** — forces HTTPS for all future requests to the
  domain, preventing protocol downgrade attacks.
- **Referrer-Policy: strict-origin-when-cross-origin** — limits referrer
  information leaked to third parties.

These headers do not prevent vulnerabilities on their own, but they
significantly reduce the exploitability of any XSS or injection bug that might
be found.

## Server-side request forgery

The server makes outbound HTTPS requests during federation (fetching
`keypears.json` from remote domains). These requests are mediated by a
`safeFetch` wrapper that:

- Resolves DNS before each request and rejects private IP ranges
  (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
  `169.254.0.0/16`, `0.0.0.0/8`).
- Enforces a 5-second timeout.
- Limits response size to 1 MB.
- Rejects HTTP redirects entirely (`redirect: "error"`). This prevents an
  attacker-controlled domain from redirecting federation lookups to internal
  services such as the AWS instance metadata endpoint.

## Rate limiting

Per-IP rate limiting is enforced at the infrastructure layer via AWS WAF, which
attaches to the Application Load Balancer in front of the Fargate tasks
serving the application. Rate-based rules apply globally across all tasks,
which is important because in-memory rate limiting in Node.js would scale
incorrectly with horizontal autoscaling.

See `infra/README.md` for the deployment architecture.

## Hybrid defense-in-depth

KeyPears uses a hybrid cryptographic design that combines classical and
post-quantum algorithms at every layer:

- **Signing**: composite Ed25519 + ML-DSA-65 (both must verify)
- **Encryption**: hybrid X25519 + ML-KEM-768 (both shared secrets combined via HKDF-SHA-256)

This hybrid approach provides defense-in-depth: an attacker must break **both**
the classical and post-quantum algorithms to compromise confidentiality or
forge signatures. A breakthrough against lattice-based cryptography alone does
not compromise the system (X25519 and Ed25519 still protect it). Conversely,
a future quantum computer that breaks elliptic curves cannot compromise the
system either (ML-KEM-768 and ML-DSA-65 still protect it).

ML-DSA-65 (FIPS 204) and ML-KEM-768 (FIPS 203) are NIST-standardized
post-quantum algorithms designed to resist attacks from both classical and
quantum computers. Ed25519 and X25519 are widely deployed, well-studied
classical algorithms that provide a conservative security floor.

## Limitations

KeyPears does not protect against:

- **Compromised endpoints** — an attacker with access to the running client can
  read decrypted content and can sign as the user while the session and keys are
  usable.
- **Active hosted-server key substitution** — servers are trusted authorities
  for current public keys on the domains they host. A malicious server can lie
  about future keys for its users. Self-hosting is the trust exit.
- **Weak passwords** — an entropy meter guides users but the protocol does not
  enforce a minimum.
- **DNS-level attacks** — BGP hijacking could redirect domain resolution.
  Mitigated by DNSSEC where deployed.
- **Forward secrecy** — the protocol does not provide message-level forward
  secrecy. TLS provides forward secrecy for transport sessions, but stored
  application ciphertext is decryptable if long-term keys are later compromised.
  Defending against this would require ratchet state, prekey management, and
  multi-device synchronization — complexity that KeyPears trades away in favor
  of durable retrieval, federation simplicity, and independent implementability.
  Key rotation and message deletion provide temporal compartmentalization.
