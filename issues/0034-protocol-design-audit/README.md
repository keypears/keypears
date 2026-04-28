+++
status = "open"
opened = "2026-04-27"
+++

# Protocol design audit

## Goal

Audit the KeyPears protocol design for security properties, trust assumptions,
and design gaps that are not obvious from the primitive choices alone.

## Background

The current protocol uses a strong hybrid construction at the message layer:
composite Ed25519 + ML-DSA-65 signatures and hybrid X25519 + ML-KEM-768
encryption. The signed message envelope is length-prefixed and covers sender and
recipient addresses, sender public keys, recipient encryption public keys, and
both ciphertext copies. That is a good baseline.

The largest audit findings are in identity and key-discovery semantics rather
than in the cryptographic envelope itself.

## Findings

### Trust boundary: active servers can substitute future public keys by design

The security docs currently say KeyPears protects user data even if the server
is fully compromised. That wording is too broad. Message encryption depends on
`getPublicKey` returning the recipient's current server-stored public keys, so
an actively malicious server can substitute public keys for future messages.

A compromised recipient server, malicious hosted provider, or compromised local
server can return attacker-controlled X25519 and ML-KEM public keys for future
messages. Senders will encrypt to those keys, and the attacker can decrypt those
new messages. The recipient may fail to decrypt them later, but confidentiality
has already been lost.

This does not break the hybrid primitive; it reflects the protocol trust model.
KeyPears is designed to make end-to-end encryption possible for people who run
their own server and to reduce the blast radius of server compromise compared
with email. It is not a design goal to hide future messages from an actively
malicious server that is authoritative for an address's current keys.

Relevant code:

- `webapp/src/server/message.functions.ts` returns active keys for local users
  and proxies remote keys without end-user authentication.
- `webapp/src/server/api.router.ts` exposes only the active public key set.
- `webapp/src/server/federation.server.ts` trusts the remote server's
  `getPublicKey` response after TLS/domain discovery.

Recommended direction: document this boundary directly. Explain that a
compromised email server can read stored mail, while a compromised KeyPears
server cannot decrypt historical ciphertext unless it also obtains client-side
keys or passwords. Its cryptographic attack is active key substitution for
future messages. Users who do not trust a hosted server's key authority should
host their own domain.

### High: sender key verification is tied to the current active key

Remote delivery verifies that the message's sender public keys match the
sender's currently federated active keys. That means a legitimate message signed
with a retained older sender key can fail if the sender rotates keys between
challenge/signing and recipient delivery, or if a pending delivery is retried
after rotation.

The protocol already solves this race for recipient encryption keys by carrying
`recipientKeyNumber` and validating against retained recipient keys. There is no
equivalent sender key number or retained sender-key lookup.

Relevant code:

- `webapp/src/server/api.router.ts` `getPublicKey` returns active keys only.
- `webapp/src/server/api.router.ts` `notifyMessage` compares embedded sender
  keys to `fetchRemotePublicKey`, which also returns only active keys.
- `webapp/src/server/message.functions.ts` validates local sender messages
  against the sender's active key only.

Recommended direction: include `senderKeyNumber` in the message and expose a
federated lookup for a retained key set by address and key number, or state that
rotation invalidates in-flight messages and design retry behavior around that
limitation.

### Medium: PoW challenge signing should use canonical length-prefixed fields

Message signatures use a length-prefixed envelope, but PoW challenge HMAC input
concatenates `nonNonce`, `target`, `expiresAt`, and optional addresses directly.
The fixed-width fields reduce most ambiguity, but optional variable-length
addresses should still be encoded canonically with labels and lengths.

This is especially important because the documentation describes the PoW
challenge as cross-conversation bound. Protocol fields that make security claims
should have one unambiguous byte representation.

Relevant code:

- `webapp/src/server/pow.server.ts` `signChallenge`
- `webapp/src/lib/auth.ts` `signPowRequest` also signs a colon-delimited string

Recommended direction: reuse the message-envelope pattern for PoW request
signatures and HMAC challenges: domain label, version, field label, length,
value.

### Medium: password KDF documentation overstates brute-force economics

The KDF uses PBKDF2-HMAC-SHA-256 with fixed deterministic client salts. The
server hash adds a per-user salt, so a database attacker still has per-user work
at the server tier, but the first 600k client-side rounds for a password
candidate are reusable across all users because those salts do not vary by user.

The docs currently imply the full 1.2M-round chain must be recomputed
independently for each user. More precisely, an attacker can compute
password-to-login-key once per candidate, then apply the per-user server tier
for each target.

Recommended direction: either add a user/domain-specific salt into the client
derivation where compatibility allows, or update the security claim to describe
the actual economics.

### Medium: client-storage compromise claims understate signing-key impact

The docs say an attacker who steals client storage cannot impersonate the user.
That is true only if "client storage theft" excludes access to encrypted
private-key blobs and an authenticated session. The cached encryption key can
decrypt the user's Ed25519 and ML-DSA signing keys once the blobs are available.

A pure localStorage dump may not include those blobs, but XSS or malware in the
running origin can usually combine cached encryption key access with session
access and server-function calls.

Recommended direction: tighten the threat model language: storage-only theft is
different from active origin compromise. Active origin compromise can sign
messages and auth assertions until keys are rotated or sessions are revoked.

## Positive notes

- The message envelope is length-prefixed and domain-separated.
- The message signature covers both ciphertext copies and the public keys used
  by the encryption operation.
- Recipient key rotation race handling is present through `recipientKeyNumber`
  and retained key validation.
- PoW solutions are consumed in a spent-token table, reducing replay risk.
- Server functions that mutate protected data generally use auth middleware.

## Experiment 1

Design the durable key identity model. Start with sender and recipient key
history because it addresses both the critical key-substitution finding and the
high-severity rotation race. The experiment should answer:

- What does an address sign or pin as its long-term identity root?
- How does a new device verify that the key history it sees is complete?
- How does a correspondent distinguish normal rotation from key replacement?
- What federation endpoint is needed to fetch retained sender keys by key
  number?
- Which security claims remain true under database compromise, active server
  compromise, malicious hosting provider, and active browser-origin compromise?

### Result

Rejected. Durable key transparency, contact pinning, and signed key history are
not aligned with the current product goal. They would make the protocol more
complex and would imply a stronger hosted-server trust model than KeyPears is
trying to provide.

The desired stance is simpler: hosted servers remain trusted authorities for
the current public keys they publish. KeyPears improves on email by encrypting
stored history and making self-hosting practical, not by eliminating all trust
in an active hosted server. If users do not trust a server, the protocol answer
is to host their own domain.

Conclusion: the next experiment should update the whitepaper, docs, root
project guidance, and relevant comments so this trust boundary is explicit and
consistent.

## Experiment 2

Update protocol-facing text to explain the active-server trust boundary and
recenter the protocol around simplicity, federation, and broad implementability.
Do this without adding key transparency, TOFU pinning, or signed key-history
mechanisms.

Scope:

- `whitepaper/keypears.typ`
- `README.md`
- `AGENTS.md`
- `webapp/src/docs/security.md`
- `webapp/src/docs/federation.md`
- `webapp/src/docs/self-hosting.md`
- `webapp/src/docs/welcome.md`
- `webapp/src/docs/protocol/addressing.md`
- `webapp/src/docs/protocol/encryption.md`
- `webapp/src/docs/protocol/key-derivation.md`
- `webapp/src/docs/protocol/proof-of-work.md`
- Relevant implementation comments near key discovery, federation, and message
  delivery

Explicitly out of scope:

- Historical blog posts in `webapp/src/blog/`
- Adding key transparency, TOFU pinning, signed key history, or new federation
  endpoints
- Changing cryptographic wire formats

Positioning changes:

- Replace the long whitepaper framing "A Federated Hybrid Post-Quantum
  End-to-End Encrypted Messaging Protocol" wherever appropriate with the simpler
  framing "Simple Federated Encrypted Messaging System".
- Keep hybrid post-quantum cryptography in the body text where it matters, but
  do not make the title carry every implementation detail.
- Make simplicity a first-class protocol design goal: KeyPears should be small
  enough for many kinds of applications to embed, not just a standalone
  messenger.
- Explain that wide adoption depends on an email-like trust and deployment
  model: domains, HTTPS, server-published current keys, and self-hosting as the
  trust exit.
- Avoid language that implies KeyPears is trying to reproduce Signal's complete
  trust model, global key transparency, or a no-trust hosted-server experience.

Required stance:

- KeyPears protects stored message history against database compromise and
  passive server compromise.
- KeyPears does not try to protect future messages from an active server that
  is authoritative for a user's current public keys and lies about them.
- This is an intentional simplicity tradeoff, analogous to the trust boundary
  in email but with a smaller cryptographic blast radius.
- A compromised email server can read stored mail; a compromised KeyPears
  server cannot decrypt already-stored application ciphertext unless it also
  obtains client-side keys, passwords, or active origin/session access.
- Hosted servers are still trusted to publish honest current keys and serve
  honest client code.
- The mitigation for not trusting a hosted server is self-hosting the domain,
  not adding a complex global key-authentication layer.
- Simplicity is a security and adoption property: a protocol that many apps can
  implement correctly is preferable to a more ambitious protocol that few
  implement at all.

Acceptance criteria:

- The whitepaper title and nearby project positioning use "Simple Federated
  Encrypted Messaging System" where that is the canonical, high-level framing.
- The phrase "fully compromised server" is replaced or qualified wherever it
  could imply active MITM resistance.
- Security docs distinguish database compromise, passive server compromise, and
  active server compromise.
- Federation docs explain that `getPublicKey` is an authoritative server
  response, not a transparency-backed identity proof.
- Self-hosting docs explicitly frame domain ownership as the trust exit.
- README and AGENTS summarize the stance so future work does not reintroduce
  contradictory claims.
- Code comments near key discovery and message delivery use the same language:
  servers are trusted key authorities for their hosted addresses.
- The docs explain that protocol simplicity is intentional so KeyPears can be
  embedded into many kinds of applications.
- Historical blog posts remain unchanged.

### Result

Pass. The whitepaper, root README, AGENTS guidance, current docs, and relevant
implementation comments now present KeyPears as a simple federated encrypted
messaging system. The text explicitly distinguishes database/passive server
compromise from active hosted-server key substitution, describes hosted servers
as authoritative current-key publishers for their domains, and frames
self-hosting as the trust exit. Historical blog posts were not modified.

## Experiment 3

Update password KDF documentation to be conservative and precise about PBKDF2
work factors.

Problem:

The current design performs 600,000 PBKDF2-HMAC-SHA-256 rounds on the server
with a per-user salt, plus two deterministic 300,000-round client-side tiers
before the login key is sent to the server. The server-side 600,000-round tier
is the conservative baseline and matches the intended password-storage
recommendation. The extra client-side rounds add work for password guesses, but
because their salts are deterministic protocol salts, that client-side work can
be reused for the same password candidate across users.

The documentation should not market the system as simply "1.2M rounds" in a way
that implies the full chain is independently target-specific for every user. It
should instead say:

- The server stores only a 600,000-round PBKDF2-HMAC-SHA-256 hash of the login
  key using a per-user salt.
- This server-side tier is the conservative password-storage baseline.
- The client also computes two 300,000-round deterministic tiers before sending
  the login key.
- For a single target user, a password guess must pass through the client-side
  tiers and that user's server-side tier.
- For attacks across many users, the deterministic client-side tiers can be
  reused per password candidate, while the 600,000-round server tier remains
  per-user because of the per-user salt.
- Therefore docs should describe the security baseline as "600k server-side
  rounds, with additional client-side stretching" rather than relying on a
  headline "1.2M rounds" claim.

Scope:

- `webapp/src/docs/protocol/key-derivation.md`
- `webapp/src/docs/security.md`
- `whitepaper/keypears.typ`
- `AGENTS.md`
- Any nearby README or comment that summarizes the KDF work factor

Explicitly out of scope:

- Changing KDF algorithms, salts, or wire/account formats
- Adding user-specific client salts
- Changing password compatibility
- Historical blog posts

Acceptance criteria:

- No current documentation implies that all 1.2M rounds are independently
  per-user for bulk offline attacks.
- The conservative headline is 600k server-side rounds with per-user salt.
- Client-side tiers are still documented accurately as additional deterministic
  stretching.
- The docs explain the single-user and multi-user attack economics plainly.
- The KDF implementation remains unchanged.

### Result

Pass. The current KDF docs, security docs, whitepaper, and AGENTS guidance now
use the 600k per-user server-side PBKDF2 tier as the conservative headline, and
describe the two 300k deterministic client-side tiers as additional stretching.
They explain that a single-user guess traverses both client tiers and that
user's server tier, while bulk attacks can reuse the deterministic client-tier
work per password candidate and must still perform the per-user server tier for
each target. No KDF implementation or compatibility behavior changed.

## Experiment 4

Update client-compromise documentation to distinguish localStorage-only theft
from active browser-origin compromise.

Problem:

KeyPears caches the encryption key in localStorage so users can decrypt keys,
messages, and vault entries without re-entering their password. The encryption
key is deliberately separate from the login key: knowing the cached encryption
key alone does not derive the login key and does not create a server session.

That narrow statement is useful but incomplete. If an attacker can run code in
the KeyPears origin, they can usually combine:

- the cached encryption key from localStorage,
- the user's authenticated session/cookies,
- server functions that return encrypted private-key blobs,
- and client-side decrypt/sign helpers,

to decrypt Ed25519 and ML-DSA signing keys and sign messages or auth assertions
as the user until sessions are revoked, keys are rotated, or the compromised
client is cleared.

The documentation should make this distinction explicit without changing the
cached-key design.

Scope:

- `webapp/src/docs/security.md`
- `webapp/src/docs/protocol/key-derivation.md`
- `whitepaper/keypears.typ`
- `AGENTS.md`
- Any nearby README or code comments that summarize cached encryption key risk

Explicitly out of scope:

- Changing localStorage caching behavior
- Adding hardware-backed key storage
- Changing session cookies or auth middleware
- Adding new recovery or revocation flows
- Historical blog posts

Required stance:

- LocalStorage-only theft of the cached encryption key does not derive the
  login key and does not by itself create a server session.
- If the attacker also obtains encrypted private-key blobs, the cached
  encryption key can decrypt private keys.
- Active origin compromise is stronger than storage-only theft. Code executing
  as the KeyPears origin can combine session access, server functions, cached
  encryption key access, and client-side crypto to act as the user.
- Active origin compromise can sign messages and third-party auth assertions
  until the session is revoked, keys are rotated, or the client is cleaned.
- This is a standard web-app endpoint compromise boundary, not a reason to
  redesign the protocol.

Acceptance criteria:

- Docs no longer make the unqualified claim that client storage compromise
  cannot impersonate the user.
- Security docs clearly separate localStorage-only theft, encrypted key-blob
  theft, authenticated session theft, and active origin compromise.
- Key-derivation docs keep the encryption-key/login-key separation claim but
  attach the correct caveat.
- Whitepaper limitations mention active origin compromise as able to sign as
  the user, not only read plaintext.
- Implementation remains unchanged.

### Result

Pass. The security docs, key-derivation docs, whitepaper, AGENTS guidance, and
the local auth comment now distinguish localStorage-only theft from active
origin compromise. They preserve the encryption-key/login-key separation claim
while making clear that encrypted key blobs plus the cached encryption key can
decrypt private keys, and that active origin/session compromise can sign
messages or third-party auth assertions as the user until sessions are revoked,
keys are rotated, or the client is cleaned. No protocol, storage, or session
behavior changed.
