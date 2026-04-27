#import "@preview/cetz:0.3.4"

#set document(
  title: "KeyPears: Simple Federated Encrypted Messaging System",
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
    KeyPears: Simple Federated \
    Encrypted Messaging System
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
  *Abstract.* KeyPears is a simple federated encrypted messaging system for
  communication and authentication. User identities are email-style
  addresses (`name@domain`) backed by hybrid post-quantum key pairs: Ed25519 +
  ML-DSA-65 (FIPS~204) for composite signatures and X25519 + ML-KEM-768
  (FIPS~203) for hybrid key encapsulation. Any domain can host a KeyPears
  server, and servers discover each other through DNS and a well-known
  configuration file. Private-key operations, encryption, and decryption use
  NIST-approved primitives and execute client-side; proof-of-work mining also
  executes client-side. Servers store encrypted message bodies and secret
  payloads but never possess the keys needed to decrypt already-stored
  ciphertext; metadata such as addresses and vault labels remain plaintext to
  support routing and search. Domains remain trusted authorities for their
  users' current public keys and hosted client code. This email-like trust
  boundary keeps the protocol small enough for broad implementation: if a user
  does not trust a hosted server in that role, the trust exit is to host their
  own domain. A proof-of-work mechanism provides Sybil resistance for account
  creation, account login, and messaging without CAPTCHAs or third-party
  services. A redirect-based authentication protocol allows third-party
  applications to verify user identity without passwords, API keys, or client
  registration. This paper describes the protocol design, cryptographic
  construction, federation model, and security analysis.
]

#v(1em)

// --- Body ---

= Introduction

Internet communication has relied on email for over four decades. Email got
two things right: human-readable addresses (`name@domain`) and federation via
DNS (any domain can run a mail server, and servers discover each other through
MX records). These properties gave email universal reach without central
control.

But email was designed for trusted networks. Two fundamental deficiencies,
deeply embedded in the SMTP protocol, have resisted every attempt at
correction.

*No key exchange.* Without cryptographic keys bound to addresses, end-to-end
encryption requires users to manage keys manually. PGP attempted this:
public-key cryptography layered onto email via key servers and a web of trust.
Whitten and Tygar demonstrated the result in 1999~#cite(<whitten1999>): given
90 minutes with PGP~5.0, the majority of test participants could not
successfully encrypt a message. The problem was not the cryptography but the
user interface. Twenty-seven years later, encrypted email remains a niche
practice.

*No cost to send.* Delivering an email costs the sender nothing, making spam
economically rational. Back proposed Hashcash in 1997~#cite(<back2002>)---a
proof-of-work scheme that imposes a computational cost on each message. The
idea was sound, but SMTP has no mechanism to negotiate proof of work, and
backwards compatibility prevents making it mandatory.

Centralized alternatives solved these problems by abandoning federation.
Signal~#cite(<moxie2016>) provides automatic key management and end-to-end
encryption, but identity is bound to phone numbers and a single organization
runs every server.

Meanwhile, quantum computers threaten the elliptic-curve cryptography that
underpins most modern systems. Babbush et al.~#cite(<babbush2026>)
demonstrated in April 2026 that breaking 256-bit elliptic-curve discrete
logarithms requires only ~1,200 logical qubits---executable in approximately
9 minutes on a superconducting architecture with fewer than half a million
physical qubits. The industry consensus~#cite(<signal-pqxdh>)#cite(<openpgp-pqc>)
is that hybrid constructions---combining classical and post-quantum
algorithms---provide defense-in-depth during the transition: if a structural
flaw is discovered in lattice cryptography, classical algorithms still protect;
if a quantum computer arrives, post-quantum algorithms still protect.

We propose a protocol that keeps what email got right---federated `name@domain`
addressing, DNS-based server discovery, and simple deployment---while adding
hybrid post-quantum key exchange for encrypted message bodies, composite
signatures for authentication, and proof of work for spam mitigation. The
design intentionally keeps domain servers as the authorities for their users'
current public keys. This does not remove all trust from hosted servers; it
makes the trust boundary portable. A user who does not trust a hosted server
can switch service providers, or host the domain themselves.

All asymmetric cryptography combines classical Curve25519 primitives (X25519,
Ed25519) with NIST-standardized post-quantum algorithms
(ML-KEM-768~#cite(<fips203>), ML-DSA-65~#cite(<fips204>)), matching the hybrid
direction adopted by Signal~#cite(<signal-pqxdh>), Chrome TLS, and the IETF
OpenPGP PQC draft~#cite(<openpgp-pqc>).

= Design Principles

KeyPears is guided by six principles:

+ *Simple.* The protocol is small enough for many kinds of applications to
  embed. Simplicity is an adoption and security property: a protocol that many
  apps implement correctly is preferable to a more ambitious protocol that few
  implement at all.
+ *Federated.* Any domain can run a KeyPears server. Servers discover each
  other via DNS. No registration authority controls participation.
+ *End-to-end encrypted.* Message bodies and secret payloads are encrypted
  client-side; servers store only ciphertext for these. Metadata (addresses,
  vault labels) is intentionally plaintext for routing and search.
+ *Client-side proof of work.* Every account creation, login, and message
  requires proof of work computed by the client.
+ *DNS-based identity.* Addresses are `name@domain`. Identity is bound to DNS
  domain ownership, not to a phone number or a central registry. The server for
  a domain is trusted to publish honest current public keys for that domain's
  users; self-hosting is the trust exit.
+ *Hybrid post-quantum by default.* Classical (Ed25519, X25519) and
  post-quantum (ML-DSA-65, ML-KEM-768) algorithms are combined in every
  cryptographic operation. Both must be broken to compromise the system.

= Overview

A typical interaction proceeds as follows. Alice (`alice@a.com`) wants to send
an encrypted message to Bob (`bob@b.com`). Neither Alice nor Bob has
communicated before.

#figure(
  cetz.canvas(length: 1cm, {
    import cetz.draw: *

    let col-a = 1.5
    let col-as = 5.5
    let col-bs = 9.5
    let col-b = 13.5

    // Column headers
    content((col-a, 0), text(size: 8pt)[*Alice's Browser*], anchor: "south")
    content((col-as, 0), text(size: 8pt)[*a.com Server*], anchor: "south")
    content((col-bs, 0), text(size: 8pt)[*b.com Server*], anchor: "south")
    content((col-b, 0), text(size: 8pt)[*Bob's Browser*], anchor: "south")

    // Vertical lifelines
    let y-start = -0.4
    let y-end = -8.6
    for x in (col-a, col-as, col-bs, col-b) {
      line((x, y-start), (x, y-end), stroke: (dash: "dashed", paint: luma(180)))
    }

    // Steps
    let y = -0.8
    let step = -0.85

    // 1
    line((col-a, y), (col-as, y), mark: (end: ">"))
    content(((col-a + col-as) / 2, y + 0.25), text(size: 7pt)[1. Look up Bob's keys])

    y += step
    line((col-as, y), (col-bs, y), mark: (end: ">"))
    content(((col-as + col-bs) / 2, y + 0.25), text(size: 7pt)[2. `getPublicKey`])

    y += step
    line((col-a, y), (col-bs, y), mark: (end: ">"), stroke: (dash: "dotted"))
    content(((col-a + col-bs) / 2, y + 0.25), text(size: 7pt)[3. PoW challenge (composite signed)])

    y += step
    content((col-a + 1.5, y), text(size: 7pt)[4. Mine PoW  ·  5. DH + KEM + encrypt + sign])

    y += step
    line((col-a, y), (col-as, y), mark: (end: ">"))
    content(((col-a + col-as) / 2, y + 0.25), text(size: 7pt)[6. Ciphertext + PoW + signature])

    y += step
    line((col-as, y), (col-bs, y), mark: (end: ">"))
    content(((col-as + col-bs) / 2, y + 0.25), text(size: 7pt)[7. Notify + pull token])

    y += step
    content((col-bs + 1.8, y), text(size: 7pt)[8. Resolve a.com via DNS/TLS], anchor: "west")

    y += step
    line((col-bs, y), (col-as, y), mark: (end: ">"))
    content(((col-as + col-bs) / 2, y + 0.25), text(size: 7pt)[9. Pull message (token)])

    y += step
    line((col-bs, y), (col-b, y), mark: (end: ">"))
    content(((col-bs + col-b) / 2, y + 0.25), text(size: 7pt)[10. Deliver ciphertext])
  }),
  caption: [Message flow: Alice sends an encrypted message to Bob across two federated domains.],
)

+ Alice's client asks her server for Bob's public keys. Her server fetches
  all four of Bob's public keys (Ed25519, X25519, ML-DSA-65, ML-KEM-768) from
  Bob's server via the federation API. Bob's server is the authority for the
  current keys of addresses hosted on Bob's domain.
+ Alice's client requests a proof-of-work challenge from Bob's server. The
  request is signed with Alice's composite Ed25519 + ML-DSA-65 key.
+ Alice's client mines the challenge on the GPU.
+ Alice computes an X25519 DH shared secret and encapsulates to Bob's
  ML-KEM-768 key. Both shared secrets are combined via HKDF-SHA-256 to derive
  an AES-256 key. She encrypts the message and a second copy to her own keys
  for sent-message history. She signs a canonical envelope with composite
  Ed25519 + ML-DSA-65.
+ Alice sends the ciphertexts, composite signature, and PoW solution to her
  server.
+ Alice's server stores her copy, creates a pull token, and notifies
  Bob's server.
+ Bob's server independently resolves Alice's domain via DNS and TLS. It pulls
  the ciphertext, verifies the composite signature, and stores the message.
+ Bob's client retrieves the ciphertext, re-derives the X25519 DH shared
  secret and decapsulates ML-KEM-768, and decrypts.

At no point does any server possess the plaintext or the keys needed to derive
it.

This statement describes stored ciphertext and honest key discovery. An active
server that is authoritative for a domain can lie about future public keys for
addresses on that domain. KeyPears accepts this email-like trust boundary to
keep federation simple and implementable; users who do not trust a hosted
server should host their own domain.

= Identity and Addressing

A KeyPears address has the form `name@domain`---intentionally identical to an
email address. The domain is a standard DNS domain. An organization with
existing email addresses can use the same addresses for KeyPears.

Each user holds four types of key pairs:

- *Ed25519 key pair*: a 32-byte public key and 32-byte private key. Used as the
  classical component of composite signatures.
- *ML-DSA-65 signing key pair* (FIPS~204): a 1,952-byte verifying key and a
  4,032-byte signing key. Used as the post-quantum component of composite
  signatures.
- *X25519 key pair*: a 32-byte public key and 32-byte private key. Used as the
  classical component of hybrid key exchange.
- *ML-KEM-768 encapsulation key pair* (FIPS~203): a 1,184-byte encapsulation
  key and a 2,400-byte decapsulation key. Used as the post-quantum component
  of hybrid key exchange.

Four key pairs are necessary because each algorithm serves a distinct role.
Ed25519 and ML-DSA-65 are independent signature schemes combined into a
composite. X25519 and ML-KEM-768 are independent key exchange/encapsulation
mechanisms combined in the hybrid encryption layer.

Users may rotate all four key pairs atomically, up to 100 sets per account.
Old keys are retained so that messages encrypted under previous keys can still
be decrypted. All private keys are encrypted client-side with AES-256-GCM
under the user's encryption key (Section~5) and stored on the server as
ciphertext.

The currently hosting server publishes the active public key set for each
address on its domain. This is an authoritative server response rather than a
global transparency-backed identity proof.

= Key Derivation

Password-based key derivation uses a three-tier PBKDF2-HMAC-SHA-256 scheme
(RFC 8018). The server-side tier alone performs 600,000 rounds, matching the
OWASP Password Storage Cheat Sheet recommendation; with the two client-side
tiers of 300,000 rounds each, the full password-to-hash chain runs 1,200,000
rounds.

#figure(
  cetz.canvas(length: 1cm, {
    import cetz.draw: *

    let box-w = 4.2
    let box-h = 0.8
    let center-x = 5

    // Password
    rect((center-x - box-w / 2, 0), (center-x + box-w / 2, box-h))
    content((center-x, box-h / 2), [*Password*])

    // Arrow down
    line((center-x, 0), (center-x, -0.8), mark: (end: ">"))
    content((center-x + 2.7, -0.4), text(size: 8pt)[300k rounds PBKDF2])

    // Password Key
    let pk-y = -0.8
    rect((center-x - box-w / 2, pk-y - box-h), (center-x + box-w / 2, pk-y))
    content((center-x, pk-y - box-h / 2), [*Password Key* #text(size: 8pt)[(ephemeral)]])

    // Fork left: Encryption Key
    let fork-y = pk-y - box-h
    let left-x = center-x - 3.5
    let right-x = center-x + 3.5

    line((center-x - 0.5, fork-y), (left-x, fork-y - 1.0), mark: (end: ">"))
    content((left-x - 1.2, fork-y - 0.5), text(size: 8pt)[300k rounds\ salt A])

    rect((left-x - box-w / 2, fork-y - 1.0 - box-h), (left-x + box-w / 2, fork-y - 1.0))
    content((left-x, fork-y - 1.0 - box-h / 2), [*Encryption Key*])
    content((left-x, fork-y - 1.0 - box-h - 0.4), text(size: 7pt)[cached on client])

    // Fork right: Login Key
    line((center-x + 0.5, fork-y), (right-x, fork-y - 1.0), mark: (end: ">"))
    content((right-x + 1.2, fork-y - 0.5), text(size: 8pt)[300k rounds\ salt B])

    rect((right-x - box-w / 2, fork-y - 1.0 - box-h), (right-x + box-w / 2, fork-y - 1.0))
    content((right-x, fork-y - 1.0 - box-h / 2), [*Login Key*])
    content((right-x, fork-y - 1.0 - box-h - 0.4), text(size: 7pt)[sent to server once, discarded])

    // Server hashing
    let srv-y = fork-y - 1.0 - box-h - 0.4
    line((right-x, srv-y - 0.3), (right-x, srv-y - 1.1), mark: (end: ">"))
    content((right-x + 2.7, srv-y - 0.7), text(size: 8pt)[600k rounds\ per-user salt])

    rect(
      (right-x - box-w / 2, srv-y - 1.1 - box-h),
      (right-x + box-w / 2, srv-y - 1.1),
    )
    content((right-x, srv-y - 1.1 - box-h / 2), [*Stored Hash*])
    content((right-x, srv-y - 1.1 - box-h - 0.4), text(size: 7pt)[server-side, never leaves DB])
  }),
  caption: [Three-tier key derivation. The password key is ephemeral. The encryption key and login key are siblings---compromising one does not reveal the other.],
)

*Tier 1: Password #sym.arrow Password Key.* The password is stretched with
300,000 rounds of PBKDF2-HMAC-SHA-256. The result is an ephemeral 256-bit
password key, used to derive the encryption key and login key, then discarded.

*Tier 2a: Password Key #sym.arrow Encryption Key.* A second 300,000-round
PBKDF2 derivation with a distinct salt produces the encryption key. This key
is cached on the client and used to encrypt and decrypt all four private keys
(Ed25519, X25519, ML-DSA-65, ML-KEM-768). It is never sent to the server.

*Tier 2b: Password Key #sym.arrow Login Key.* A parallel derivation produces
the login key. This key is sent to the server exactly once, then discarded.
The server hashes it with an additional 600,000 rounds using a per-user salt
before storage.

*Vault key.* A separate key for encrypting stored secrets is derived as
$K_"vault" = "HMAC-SHA-256"(K_"encryption",$ `"vault-key-v2"`$)$. Each vault
entry is independently encrypted with AES-256-GCM under $K_"vault"$.

= Encryption

KeyPears uses AES-256-GCM (NIST SP 800-38D) for all symmetric encryption.
Two encryption modes are used.

*Hybrid message encryption.* When Alice sends a message to Bob, she computes
an X25519 Diffie-Hellman shared secret using her private key and Bob's public
key, and encapsulates a fresh shared secret to Bob's ML-KEM-768 encapsulation
key. The AES-256 key is derived from both shared secrets via HKDF-SHA-256
(RFC~5869):

$ K_"AES" = "HKDF-SHA-256"("salt" = 0^(32), "IKM" = S_"X25519" || S_"ML-KEM", "info") $

where info = `"webbuf:aesgcm-x25519dh-mlkem v1"`. An attacker must break both
X25519 ECDH and ML-KEM-768 to recover the message key. The message payload is
encrypted with AES-256-GCM using $K_"AES"$, with the sender and recipient
addresses bound as Additional Authenticated Data (AAD). The sender encrypts a
second copy to their own keys for sent-message history. The KEM ciphertext and
AES ciphertext are stored together as a combined blob per message.

*Composite message signing.* The sender signs a canonical length-prefixed
envelope with composite Ed25519 + ML-DSA-65 (3,374 bytes: 1 version byte +
64-byte Ed25519 signature + 3,309-byte ML-DSA-65 signature). Both halves must
verify independently. The envelope covers sender address, recipient address,
all public keys, and both ciphertexts.

*Vault encryption.* The vault stores secrets encrypted under the vault key
derived from the encryption key (Section~5). The server stores ciphertext
alongside user-provided plaintext labels to enable server-side search.

= Federation

Any domain can participate in the KeyPears federation by serving a configuration
file at `/.well-known/keypears.json`:

```json
{ "apiDomain": "keypears.acme.com" }
```

This file declares the domain's API endpoint. An optional `admin` field names
a KeyPears user authorized to manage accounts for the domain. Three deployment
patterns are supported:

#figure(
  cetz.canvas(length: 1cm, {
    import cetz.draw: *

    let box-w = 4.0
    let box-h = 0.9
    let gap = 5.0

    let x1 = 1.5
    rect((x1 - box-w / 2, 0), (x1 + box-w / 2, box-h))
    content((x1, box-h / 2), text(size: 8pt)[`acme.com`\ address + API])
    content((x1, -0.4), text(size: 7pt, weight: "bold")[Self-hosted])

    let x2 = x1 + gap
    rect((x2 - box-w / 2, 0.9), (x2 + box-w / 2, 0.9 + box-h))
    content((x2, 0.9 + box-h / 2), text(size: 8pt)[`acme.com`\ address domain])
    rect((x2 - box-w / 2, -0.6), (x2 + box-w / 2, -0.6 + box-h))
    content((x2, -0.6 + box-h / 2), text(size: 8pt)[`kp.acme.com`\ API server])
    line((x2, 0.9), (x2, -0.6 + box-h), mark: (end: ">"))
    content((x2 + 2.3, 0.5), text(size: 7pt)[keypears.json])
    content((x2, -1.0), text(size: 7pt, weight: "bold")[Subdomain])

    let x3 = x2 + gap
    rect((x3 - box-w / 2, 0.9), (x3 + box-w / 2, 0.9 + box-h))
    content((x3, 0.9 + box-h / 2), text(size: 8pt)[`acme.com`\ address domain])
    rect((x3 - box-w / 2, -0.6), (x3 + box-w / 2, -0.6 + box-h))
    content((x3, -0.6 + box-h / 2), text(size: 8pt)[`keypears.com`\ hosted API])
    line((x3, 0.9), (x3, -0.6 + box-h), mark: (end: ">"))
    content((x3 + 2.8, 0.5), text(size: 7pt)[keypears.json + admin field])
    content((x3, -1.0), text(size: 7pt, weight: "bold")[Third-party hosted])
  }),
  caption: [Three federation patterns. In each case, the address domain may differ from the API server.],
)

*Pull-model message delivery.* Cross-domain messages use a pull model rather
than server-to-server push. The sender's server stores the ciphertext and
issues a pull token. It notifies the recipient's server, which independently
resolves the sender's domain via DNS and TLS. The recipient pulls the
ciphertext, verifies the composite signature, and stores the message.

The pull model verifies which domain is speaking; it does not remove trust from
that domain's server. Each server remains the authority for the current public
keys of the users it hosts. This is the same simplicity tradeoff that made
email deployable, but with encrypted stored content and a self-hosting exit for
users who want to control their own key authority.

= Third-Party Authentication

KeyPears provides a redirect-based authentication protocol that allows any
third-party application to verify a user's identity without API keys, client
registration, or pre-existing relationships.

+ The user types their domain on the third-party application.
+ The application fetches `keypears.json` to discover the API domain.
+ The application redirects the user's browser to the KeyPears server's `/sign`
  page with a structured signing request.
+ The user reviews a consent screen and approves. The KeyPears server generates
  a nonce, timestamp, and expiry, and the user signs a canonical JSON payload
  with their composite Ed25519 + ML-DSA-65 key.
+ The signed response is submitted back via HTTP POST (POST is required because
  composite signatures are 3,374 bytes, exceeding URL length limits).
+ The application verifies the composite signature by fetching the user's
  public keys via federation.

= Proof of Work

Back proposed Hashcash~#cite(<back2002>) in 1997 as a proof-of-work scheme to
make email spam expensive. KeyPears makes proof of work a first-class protocol
requirement, building on Hashcash with four adaptations.

*Interactive challenges.* The recipient's server issues a challenge signed with
HMAC-SHA-256, including a 15-minute expiry. Challenges are stateless until a
valid solution is submitted.

*GPU mining.* All proof of work is computed client-side using the `pow5-64b`
algorithm via WebGPU. Servers never mine.

*Configurable difficulty.* Server operators set difficulty for account creation
and login. Individual users set difficulty for incoming messages.

*Authenticated challenges.* Challenge requests require the sender to sign
with their composite Ed25519 + ML-DSA-65 key. The recipient's server verifies
both the Ed25519 and ML-DSA-65 components via federation. Both sender and
recipient addresses are bound into the challenge. This prevents social-graph
probing.

= Security Analysis

== Server Compromise

The server stores encrypted message bodies and secret payloads alongside hashed
credentials (login key hashed with 600,000 additional rounds of
PBKDF2-HMAC-SHA-256). An attacker who captures the database cannot decrypt
message content or secret payloads. Metadata (addresses, vault labels, channel
counterparties) is stored in plaintext.

This protection applies to database compromise and passive server compromise.
An active server remains trusted to publish honest current public keys for the
addresses it hosts and to serve honest client code. If that server lies about
future public keys, it can cause future messages to be encrypted to attacker
keys. KeyPears does not attempt to prevent that class of hosted-server
man-in-the-middle attack. Instead, it reduces the blast radius compared with
email: a compromised email server can read stored mail, while a compromised
KeyPears server cannot decrypt already-stored application ciphertext unless it
also obtains client-side keys, passwords, or active client/session access.

This is a deliberate design choice. Adding global key transparency, contact
pinning, or a no-trust hosted-server layer would make the protocol harder to
embed and implement. The protocol's trust exit is self-hosting the domain.

== Quantum Resistance

KeyPears uses a hybrid construction combining classical (Ed25519, X25519) and
post-quantum (ML-DSA-65, ML-KEM-768) algorithms in every cryptographic
operation. An attacker must break both to compromise any operation. This
provides defense-in-depth matching the approach adopted by Signal~#cite(<signal-pqxdh>),
Chrome TLS, and the IETF OpenPGP PQC draft~#cite(<openpgp-pqc>): if a
structural flaw is discovered in lattice-based cryptography, the classical
algorithms still protect; if a cryptographically relevant quantum computer
arrives, the post-quantum algorithms still protect. Grover's algorithm provides
only a quadratic speedup against symmetric primitives, reducing their effective
security to 128 bits---still well within safe margins.

== Spam and Sybil Attacks

Every account creation, login, and message requires proof of work, and the
difficulty is tunable. The cost of an attack scales linearly with the number
of targets and with the difficulty level.

== Domain Spoofing

The pull model prevents domain spoofing without additional signing
infrastructure. The recipient's server independently resolves the sender's
domain via DNS and TLS. A malicious server cannot forge another domain's
identity because TLS guarantees the response came from the real domain.

Domain spoofing protection should not be confused with key transparency. Once a
domain has been resolved, the server for that domain is still trusted as the
current-key authority for hosted addresses.

== Client Storage Theft

An attacker who compromises client storage obtains the encryption key, which
can decrypt all four private keys (Ed25519, X25519, ML-DSA, ML-KEM). However,
the login key is a cryptographic sibling (derived from the same parent with a
different salt), not a child. The encryption key alone does not reveal the
login key. Active origin compromise is stronger than storage-only theft:
malicious script or malware running as the user can combine session access with
the cached encryption key, fetch encrypted private-key blobs, and sign messages
until the session is revoked or keys are rotated.

== Forward Secrecy

KeyPears provides end-to-end encryption, hybrid post-quantum defense-in-depth,
authenticated messages, and key rotation, but not forward secrecy or
post-compromise security in the Signal sense. This is a deliberate design
choice, not an omission.

Forward secrecy protects against an attacker who passively records encrypted
traffic and later compromises a long-term key. TLS 1.3 provides this property
for the transport layer via ephemeral Diffie-Hellman: an attacker who later
compromises a TLS server key cannot decrypt previously recorded network
sessions. KeyPears benefits from that property while messages are in transit.

KeyPears does _not_ provide message-level forward secrecy. Application
ciphertexts are intentionally stored on servers for later retrieval, and those
ciphertexts can be copied from databases, logs, backups, or compromised
endpoints independently of TLS. If a user's long-term X25519 private key and
ML-KEM decapsulation key are later extracted from client storage, previously
stored message ciphertexts encrypted to those keys are decryptable.

Signal addresses this class of endpoint-compromise risk with the Double Ratchet
protocol, which derives a fresh key for every message and deletes old message
keys. However, this requires prekey bundles, chain-key state,
skipped-message-key handling, multi-device synchronization, and recovery
mechanisms---substantial protocol complexity that is difficult to federate.
KeyPears messages are also intentionally persistent: users retrieve messages
across sessions and devices, so the client must retain enough key material to
read its own inbox. Key rotation (up to 100 key sets per account) limits
exposure for future messages, but it does not make old messages forward-secret
while old keys are retained for decryption. User-initiated message deletion can
reduce retained ciphertext, subject to normal limits around backups and copied
data.

A federated protocol must balance security properties against implementation
complexity. Every mechanism added to the specification must be implemented
correctly by independent servers and clients across the federation, increasing
the amount of state that must be synchronized, tested, and made interoperable.
TLS already provides forward secrecy for transport sessions, protecting against
later compromise of TLS server keys after passive network recording. A
message-level ratchet would address a different threat: later compromise of
stored application ciphertext and the long-term keys needed to decrypt it. That
is a real threat, but defending against it requires prekey management, ratchet
state, skipped-message-key handling, multi-device synchronization, and recovery
semantics. KeyPears accepts this trade-off explicitly: it prioritizes durable
retrieval, federation simplicity, and independent implementability over
Signal-style forward secrecy and post-compromise security.

== Limitations

KeyPears does not protect against compromised endpoints, weak passwords, or
DNS-level attacks. SLH-DSA (FIPS~205), a hash-based signature scheme, exists
as a fallback against a structural break in lattice cryptography but is not
currently used due to its substantially larger signatures (8--50~KB). The Rust
PQC libraries used by this implementation (RustCrypto `ml-kem` and `ml-dsa`)
have not received an independent third-party audit as of this writing.

= Related Work

#figure(
  table(
    columns: (auto, auto, auto, auto, auto),
    inset: 6pt,
    align: left,
    table.header([], [*PGP*], [*Signal*], [*Matrix*], [*KeyPears*]),
    [Identity], [Email addr.], [Phone \#], [`@user:domain`], [`name@domain`],
    [Federation], [Key servers], [None], [Homeservers], [DNS + pull],
    [E2E encryption], [Manual], [Automatic], [Automatic], [Automatic],
    [Spam mitigation], [None], [Phone reg.], [Rate limits], [Proof of work],
    [Key management], [Manual], [Automatic], [Automatic], [Automatic],
    [Post-quantum], [No], [Hybrid KEM], [No], [Hybrid KEM+sig],
    [3rd-party auth], [No], [No], [No], [Yes],
    [Open source], [Yes], [Yes], [Yes], [Yes],
  ),
  caption: [Comparison of encrypted communication systems.],
)

*PGP* (1991) provides strong cryptography but requires manual key management.
*Signal* (2013) solved usability with automatic key management, but is
centralized. Signal's PQXDH protocol~#cite(<signal-pqxdh>) uses hybrid X25519 +
ML-KEM for key exchange, but identity signatures remain classical Ed25519.
*Matrix* (2014) is federated and encrypted, but uses a Matrix-specific address
format and a substantially more complex architecture. *Keybase* (2014) combined
social-proof identity with encryption, but was acquired by Zoom in 2020.
KeyPears is, to our knowledge, the first federated messaging system with full
hybrid post-quantum cryptography for both key exchange and signatures.

= Future Work

Several extensions are planned. *Group messaging* with multi-party key
agreement would extend the protocol beyond pairwise communication. A *native
mobile client* with hardware-backed key storage would improve security for the
encryption key. Future extensions should preserve the core design goal: a
simple federated protocol that many applications can embed correctly.

= Conclusion

Email demonstrated that federated, human-readable addressing can achieve
universal reach. But email's design assumed trusted networks, and four decades
of effort have failed to retrofit encryption and spam resistance. Centralized
alternatives solved these problems by abandoning federation. KeyPears takes a
different path: a simple protocol that preserves `name@domain` addressing and
DNS-based federation while making hybrid post-quantum key exchange, composite
signing, and proof of work mandatory from the start.

The result is a system where encryption is the only mode, spam is
computationally expensive, identity authentication requires no passwords or API
keys, and domains remain portable. KeyPears does not pretend hosted servers
require no trust; it makes that trust explicit and moveable. If a user does not
trust a hosted server to publish honest keys, they can host their own domain.
That simplicity is what allows the protocol to be embedded broadly.

// --- References ---

#bibliography(title: "References", style: "ieee", "references.yml")
