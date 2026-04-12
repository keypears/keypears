
KeyPears is designed to protect user data even if the server is fully
compromised. This page describes what the system protects against, and what it
does not.

## Server compromise

The server stores only ciphertext (messages, vault entries, encrypted private
keys) and hashed credentials (login key hashed with 600,000 additional rounds
of PBKDF2-HMAC-SHA-256, using a per-user salt derived from the user's ID). An
attacker who captures the database cannot read any user content.

To impersonate a user, the attacker must recover a valid login key. Brute
forcing the login key directly is infeasible — it is a uniformly random 256-bit
value, and the search space is 2^256. The only realistic attack is a dictionary
attack against the user's password: for each candidate password, the attacker
computes the full chain (password → password key → login key → stored hash),
requiring 1,200,000 rounds of PBKDF2-HMAC-SHA-256 per guess (300,000 for Tier 1,
300,000 for Tier 2b, and 600,000 for the server tier).

## Password brute-force

The server-side tier alone performs 600,000 rounds of PBKDF2-HMAC-SHA-256 on
every login key, matching the OWASP Password Storage Cheat Sheet
recommendation for PBKDF2-HMAC-SHA-256. An offline attack against the stored
hash requires 1,200,000 rounds per password guess through the full chain. Per-user salts (derived deterministically from
the user ID) prevent an attacker from parallelising dictionary attacks across
the entire database.

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
must sign the request with their P-256 (NIST) private key, and the recipient's
server verifies the signature via federation.

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

## Client storage theft

An attacker who compromises a user's client storage obtains the encryption key,
which can decrypt the user's P-256 private keys. However, the login key is a
cryptographic sibling of the encryption key (derived from the same parent with
a different salt), not a child.

The attacker cannot derive the login key, cannot impersonate the user on the
server, and cannot access the server-side session. The attack surface is limited
to decrypting data already present on the compromised device.

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

## Limitations

KeyPears does not protect against:

- **Compromised endpoints** — an attacker with access to the running client can
  read decrypted content.
- **Weak passwords** — an entropy meter guides users but the protocol does not
  enforce a minimum.
- **DNS-level attacks** — BGP hijacking could redirect domain resolution.
  Mitigated by DNSSEC where deployed.
- **Forward secrecy** — the protocol does not provide forward secrecy in the
  Signal sense. All communication is transported over HTTPS/TLS, so passive
  recording of ciphertext in transit requires compromising TLS. Messages persist
  on the server for later retrieval, so the client must retain decryption keys.
