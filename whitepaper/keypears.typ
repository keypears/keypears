#set document(
  title: "KeyPears: Federated Secret Exchange",
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
    KeyPears: Federated Secret Exchange
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

// The problem, not the solution. Spend the first page on what's broken.
//
// - Email got addressing and federation right (name@domain, MX records,
//   ubiquity) but was designed for trusted networks.
// - Two deficiencies can't be fixed retroactively:
//   1. No key exchange -> PGP failed (cite Whitten & Tygar 1999)
//   2. No cost to send -> Hashcash couldn't deploy on SMTP (cite Back 2002)
// - Layering fixes hasn't worked: DMARC (cite RFC 7489) required three
//   interlocking mechanisms just for authentication, still no encryption.
// - Centralized alternatives traded one problem for another: Signal solved
//   encryption but centralized identity; WhatsApp gave metadata to Facebook.
//   Moxie's argument (cite Marlinspike 2016): centralization enables
//   iteration, but surrenders sovereignty.
// - Final paragraph: "We propose a federated protocol that keeps what email
//   got right (name@domain addressing, DNS-based discovery) while adding what
//   it couldn't: Diffie-Hellman key exchange for end-to-end encryption, and
//   proof of work for spam mitigation."

= Design Principles

// Five bullets, one sentence each:
// - Federated: any domain can run a server; servers discover each other via DNS.
// - End-to-end encrypted: servers store only ciphertext; plaintext never
//   leaves the client.
// - Client-side proof of work: Sybil resistance without CAPTCHAs or
//   third-party services.
// - DNS-based identity: addresses are name@domain; identity survives provider
//   changes.
// - No trusted third party: no certificate authority, no central key server,
//   no phone-number registry.

= Overview

// One-page high-level walkthrough with a single diagram showing Alice@a.com
// sending a secret to Bob@b.com.
//
// Diagram: end-to-end flow (Alice's browser -> Alice's server -> Bob's server
// -> Bob's browser) showing key lookup, PoW, ECDH, encrypt, pull-model
// delivery, decrypt.
//
// Brief prose walking through the diagram step by step. The reader should
// understand the full system before any section dives into detail.

= Identity and Addressing

// - Address format: name@domain
// - Key pairs: secp256k1
// - Key rotation (up to 100 keys per account)
// - Active key = most recent
// - Encrypted private key storage (server holds ciphertext only)
// - Domain ownership = identity ownership

= Key Derivation

// Three-tier BLAKE3 PBKDF:
//
// Diagram: KDF tree
//   Password -> [100k rounds] -> Password Key (ephemeral)
//     -> [100k rounds, salt A] -> Encryption Key (cached in localStorage)
//     -> [100k rounds, salt B] -> Login Key (sent to server once, discarded)
//   Server: Login Key -> [100k rounds, server salt] -> stored hash
//
// Vault key derivation: BLAKE3-MAC(private_key, "vault-key")
//
// Security properties:
// - Encryption key and login key are siblings (compromising one doesn't
//   reveal the other)
// - Password key is ephemeral
// - 300k total rounds from password to stored hash

= Encryption

// Two layers:
//
// Message encryption (ECDH):
// - Shared secret = BLAKE3(ECDH(my_priv, their_pub))
// - Encrypt with ACS2 (AES-256-CBC + BLAKE3-HMAC)
// - Both public keys stored alongside ciphertext
//
// Vault encryption:
// - Vault key = BLAKE3-MAC(private_key, "vault-key")
// - Encrypt with ACS2
// - Server stores ciphertext + plaintext labels for search

= Federation

// Discovery: /.well-known/keypears.json
//   - apiDomain (required)
//   - admin (optional, for third-party hosting)
//
// Three deployment patterns:
//   - Self-hosted (domain = API endpoint)
//   - Subdomain (API on subdomain)
//   - Third-party hosted (delegates to another operator)
//
// Diagram: federation topology showing all three patterns
//
// Pull-model message delivery:
//   1. Sender encrypts, stores locally
//   2. Sender's server issues one-time pull token
//   3. Sender notifies recipient's server
//   4. Recipient independently resolves sender's domain via DNS/TLS
//   5. Recipient pulls message with token (consumed on use)
//
// Why pull, not push: recipient verifies sender's domain independently.
// No trust in the sender's server. DNS/TLS replaces server signing keys.

= Proof of Work

// Hashcash lineage (cite Back 2002). KeyPears adapts the concept for an
// interactive web protocol with GPU mining.
//
// What changed from Hashcash:
//   - Interactive challenges (server-issued, not self-selected)
//   - GPU mining (WebGPU via pow5-64b algorithm, compiled from Rust to WASM)
//   - Per-recipient configurability
//   - Authenticated challenges (secp256k1 signatures prevent probing)
//
// Difficulty levels:
//   - Account creation: ~70M (~15s)
//   - Login: ~7M (~1-2s)
//   - First message to a user: ~70M (configurable, min 7M)
//   - Subsequent messages: ~7M (configurable, min 7M)
//
// Diagram: PoW challenge/response flow
//
// Stateless challenges: BLAKE3-MAC signed, no DB write until verification.
// Spent-token database for replay prevention (15-minute expiry).

= Security Analysis

// One subsection per threat. Quantitative where possible.
//
// == Server Compromise
// == Password Brute-Force
//   - 300k BLAKE3 rounds. Compute cost for various password strengths.
// == Spam and Sybil Attacks
//   - Cost to create N accounts = N * 70M difficulty * GPU time per hash.
//   - Cost to spam M messages = M * 7M difficulty * GPU time.
// == Social-Graph Probing
//   - Authenticated challenge requests (secp256k1 signature).
// == Domain Spoofing
//   - Pull model: recipient resolves sender domain independently.
// == LocalStorage Theft
//   - Encryption key vs login key: sibling derivation.
// == Key Compromise
// == Limitations
//   - Compromised endpoints, weak passwords, DNS-level attacks.

= Related Work

// Comparison table: KeyPears vs PGP vs Signal vs Matrix vs Keybase
//
// Columns: Identity model, Federation, E2E encryption, Spam mitigation,
//          Key management, Forward secrecy, Open source
//
// Prose: for each system, what tradeoff does it make and why did KeyPears
// choose differently?
//
// - PGP: right cryptography, wrong usability (cite Whitten & Tygar)
// - Signal: right encryption, centralized identity, no federation
//   (cite Marlinspike 2016 for the rationale)
// - Matrix: federated, but complex (Olm/Megolm, room state, DAG sync)
// - Keybase: right UX, acquired by Zoom, shut down — cautionary tale of
//   centralized hosting for a decentralized-aspirational product

= Future Work

// - Group messaging with multi-party key agreement
// - Forward secrecy via ratcheted key exchange
// - Public-key transparency logs for key rotation auditability
// - Native mobile client with hardware-backed key storage

= Conclusion

// One paragraph. Restate the problem, summarize the solution, state the
// contribution. Like Bitcoin's conclusion: no marketing, just clarity.
