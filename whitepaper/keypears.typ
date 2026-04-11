#set document(
  title: "KeyPears: A Federated Diffie-Hellman Key Exchange System",
  author: "Ryan X. Charles",
)

#set page(
  paper: "us-letter",
  margin: (x: 1in, y: 1in),
  numbering: "1",
)

#set text(
  font: "New Computer Modern",
  size: 10pt,
)

#set par(justify: true)
#set heading(numbering: "1.")

// --- Title block ---

#align(center)[
  #text(size: 16pt, weight: "bold")[
    KeyPears: A Federated Diffie-Hellman Key Exchange System
  ]

  #v(0.5em)

  #text(size: 11pt)[Ryan X. Charles]

  #text(size: 9pt, fill: luma(100))[ryan\@ryanxcharles.com]

  #v(0.5em)

  #text(size: 9pt, fill: luma(100))[April 2026]
]

#v(1em)

// --- Abstract ---

#par(first-line-indent: 0pt)[
  *Abstract.* KeyPears is an end-to-end encrypted communication and secret
  management system built on federated Diffie-Hellman key exchange. User
  identities are email-style addresses tied to DNS domains, enabling any
  organization to self-host while remaining interoperable with the wider
  network. All cryptographic operations---key derivation, encryption, and proof
  of work---execute client-side in the browser. Servers store only ciphertext
  and never possess the keys needed to decrypt it. A proof-of-work mechanism
  replaces CAPTCHAs and rate limiting, providing Sybil resistance for account
  creation, authentication, and messaging without relying on third-party
  services. This paper describes the system architecture, cryptographic
  protocol, federation model, and threat analysis.
]

#v(1em)

// --- Body ---

= Introduction

Secure communication today depends on centralized platforms that control
identity, store plaintext, and can be compelled to surrender user data.
Decentralized alternatives exist but typically sacrifice usability or require
users to manage raw public keys.

KeyPears bridges this gap with a federated model: users hold human-readable
addresses (e.g., `alice@keypears.com`) backed by secp256k1 key pairs. Any
domain operator can run a KeyPears server, and servers discover each other
through DNS and a well-known configuration file. All message content is
end-to-end encrypted via ECDH shared secrets, and all expensive
operations---key derivation, mining, encryption---run entirely in the user's
browser.

= Identity and Addressing

Each user's identity is an address of the form `name@domain`. The name is a
short alphanumeric string; the domain is a standard DNS domain. This format is
familiar, portable, and survives changes in hosting provider---if
`acme.com` migrates from one server to another, its users' addresses remain
valid.

Key pairs use the secp256k1 elliptic curve. Users may rotate keys freely (up to
100 per account), and the most recent key is the active one. Each key's
encrypted private key is stored server-side, encrypted under a key that only the
user can derive from their password. The server cannot decrypt it.

= Key Derivation

Password-based key derivation uses a three-tier BLAKE3 PBKDF scheme:

+ *Password #sym.arrow Password Key.* The user's password is stretched with
  100,000 rounds of BLAKE3 in keyed-MAC mode. The result is ephemeral and never
  stored.
+ *Password Key #sym.arrow Encryption Key.* A second 100,000-round derivation
  with a distinct salt produces the encryption key, which is cached in
  `localStorage` and used to encrypt and decrypt secp256k1 private keys
  client-side.
+ *Password Key #sym.arrow Login Key.* A parallel 100,000-round derivation with
  a different salt produces the login key, which is sent to the server once and
  then discarded. The server hashes it with an additional 100,000 rounds before
  storage.

Because the encryption key and login key are derived from the same parent with
different salts, compromising one does not reveal the other.

= Encryption

KeyPears uses two encryption layers:

*Message encryption.* When Alice sends a message to Bob, she computes a shared
secret via ECDH (her private key, Bob's public key), hashes the resulting curve
point with BLAKE3, and encrypts the message payload with ACS2 (AES-256-CBC with
BLAKE3-HMAC authentication). Both the sender's and recipient's public keys are
stored alongside the ciphertext so that either party can re-derive the shared
secret after key rotation.

*Vault encryption.* The vault stores secrets (passwords, notes, credentials)
encrypted under a vault key derived as a BLAKE3-MAC of the user's private key
with a fixed domain separator. Each vault entry is independently encrypted, and
the server stores only ciphertext plus user-provided plaintext labels for
search.

= Federation

Servers discover each other via a well-known configuration file served at
`/.well-known/keypears.json`, which declares the domain's API endpoint and,
optionally, an admin address for third-party hosting. Three deployment patterns
are supported:

- *Self-hosted:* The domain and API endpoint are the same host.
- *Subdomain:* The domain's API runs on a subdomain (e.g.,
  `keypears.acme.com`).
- *Third-party hosted:* A domain delegates its KeyPears service to another
  operator entirely.

Message delivery uses a pull model. The sender's server stores the ciphertext
and issues a one-time pull token. It then notifies the recipient's server, which
independently resolves the sender's domain via DNS and TLS, verifying
authenticity without server signing keys. The recipient pulls the message using
the token, which is consumed on use. Messages never leave the network
unencrypted.

= Proof of Work

Rather than CAPTCHAs, OAuth gates, or centralized rate limiters, KeyPears uses
client-side proof of work (the `pow5-64b` algorithm, compiled from Rust to WASM
and executed on the GPU via WebGPU). PoW is required for:

- *Account creation* (difficulty ~70M, approximately 15 seconds).
- *Login* (difficulty ~7M, approximately 1--2 seconds).
- *Messaging* (configurable per recipient: 70M for first contact, 7M for
  subsequent messages, with server-enforced minimums).

Challenges are stateless: the server signs a challenge payload with BLAKE3-MAC
and verifies the signature on submission, avoiding database writes until a valid
solution arrives. Challenge requests are authenticated---the sender signs with
their secp256k1 private key, and the recipient's server verifies the signature
via federation public-key lookup---preventing social-graph probing.

= Threat Model

KeyPears is designed to protect against the following threats:

- *Server compromise:* The server stores only ciphertext and hashed credentials.
  An attacker who captures the database cannot read messages or vault entries.
- *Password brute-force:* 300,000 cumulative BLAKE3 rounds from password to
  stored hash, plus per-action PoW, make offline and online attacks expensive.
- *Social-graph probing:* Challenge requests require a valid secp256k1 signature,
  preventing unauthenticated parties from discovering who communicates with
  whom.
- *Spam and Sybil attacks:* PoW imposes a real computational cost on account
  creation and messaging, tunable per recipient.
- *Domain spoofing:* The pull model forces recipients to independently resolve
  sender domains via DNS/TLS, preventing impersonation without DNS compromise.
- *LocalStorage theft:* An attacker who extracts the cached encryption key can
  decrypt private keys but cannot derive the login key or impersonate the user
  on the server.

The system does not protect against compromised endpoints, weak passwords
(though an entropy meter guides users), or DNS-level attacks such as BGP
hijacking.

= Future Work

Planned extensions include group messaging with multi-party key agreement,
forward secrecy via ratcheted key exchange, public-key transparency logs for
key rotation auditability, and a native mobile client with hardware-backed key
storage.

= Conclusion

KeyPears demonstrates that federated, end-to-end encrypted communication can
be built on standard web infrastructure---DNS, TLS, and browsers---without
sacrificing usability or requiring users to manage raw cryptographic material.
The combination of human-readable addresses, client-side proof of work, and a
pull-based federation model provides a practical alternative to both
centralized platforms and pure peer-to-peer systems.
