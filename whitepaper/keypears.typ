#import "@preview/cetz:0.3.4"

#set document(
  title: "KeyPears: Post-Quantum Federated Secret Exchange",
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
    KeyPears: Post-Quantum Federated Secret Exchange
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
  *Abstract.* KeyPears is a federated protocol for end-to-end encrypted
  communication and secret management. User identities are email-style
  addresses (`name@domain`) backed by post-quantum key pairs: ML-DSA-65
  (FIPS~204) for digital signatures and ML-KEM-768 (FIPS~203) for key
  encapsulation. Any domain can host a KeyPears server, and servers discover
  each other through DNS and a well-known configuration file. Private-key
  operations, encryption, decryption, and proof-of-work mining execute
  client-side using NIST-approved primitives. Servers store encrypted message
  bodies and secret payloads but never possess the keys needed to decrypt them;
  metadata such as addresses and vault labels remain plaintext to support
  routing and search. A
  proof-of-work mechanism provides Sybil resistance for account creation,
  authentication, and messaging without CAPTCHAs or third-party services. A
  redirect-based authentication protocol allows third-party applications to
  verify user identity without passwords, API keys, or client registration. This
  paper describes the protocol design, cryptographic construction, federation
  model, and security analysis.
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
successfully encrypt a message. Many sent plaintext believing it was encrypted.
The problem was not the cryptography but the user interface---key generation,
key exchange, trust decisions, and revocation are concepts that do not map onto
any familiar workflow. Twenty-seven years later, encrypted email remains a
niche practice.

*No cost to send.* Delivering an email costs the sender nothing. This makes
spam economically rational: the cost of sending a million messages is
negligible, and even a tiny conversion rate is profitable. Back proposed
Hashcash in 1997~#cite(<back2002>)---a proof-of-work scheme that imposes a
computational cost on each message, making bulk sending expensive. The idea was
sound, but SMTP has no mechanism to negotiate proof of work between sender and
receiver. Hashcash could not be deployed on email because backwards
compatibility prevents making it mandatory.

Attempts to layer fixes onto email have produced extraordinary complexity.
DMARC~#cite(<rfc7489>), published in 2015, requires three interlocking
mechanisms---SPF, DKIM, and DMARC itself---each with its own DNS records,
failure modes, and deployment challenges. After years of effort, DMARC
authenticates the sender's domain but provides zero confidentiality.

Centralized alternatives have taken a different approach. Signal solved
end-to-end encryption for billions of users with a single software update, but
at the cost of centralized identity: your address is a phone number controlled
by a carrier, and a single organization runs every server. As Marlinspike
argued~#cite(<moxie2016>), centralization enables rapid iteration---but it also
means one entity controls your identity, your keys, and your social graph.

Meanwhile, the cryptographic landscape is shifting. Quantum computers threaten
the elliptic-curve cryptography that underpins most modern systems. Babbush et
al.~#cite(<babbush2026>) demonstrated in April 2026 that breaking 256-bit
elliptic-curve discrete logarithms requires only ~1,200 logical qubits and ~90
million Toffoli gates---executable in approximately 9 minutes on a
superconducting architecture with fewer than half a million physical qubits.
This is a 20-fold reduction from prior estimates. Every system still using P-256,
Ed25519, or X25519 is on borrowed time.

We propose a protocol that keeps what email got right---federated `name@domain`
addressing and DNS-based server discovery---while adding what email could not:
post-quantum key encapsulation for end-to-end encryption, and proof of work for
spam mitigation. Both are mandatory from day one, not retrofitted onto a
protocol that was never designed for them. All asymmetric cryptography uses
NIST-standardized post-quantum algorithms: ML-KEM-768~#cite(<fips203>) for key
encapsulation and ML-DSA-65~#cite(<fips204>) for digital signatures.

= Design Principles

KeyPears is guided by five principles:

+ *Federated.* Any domain can run a KeyPears server. Servers discover each
  other via DNS. No registration authority controls participation.
+ *End-to-end encrypted.* Message bodies and secret payloads are encrypted
  client-side; servers store only ciphertext for these. Metadata (addresses,
  vault labels) is intentionally plaintext for routing and search.
+ *Client-side proof of work.* Every account creation, login, and message
  requires proof of work computed by the client. No CAPTCHAs, no third-party
  verification services.
+ *DNS-based identity.* Addresses are `name@domain`. Identity is bound to DNS
  domain ownership, not to a phone number or a central registry.
+ *Post-quantum by default.* All asymmetric cryptography uses NIST-finalized
  post-quantum standards. No classical elliptic-curve algorithms remain.

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
    content(((col-a + col-bs) / 2, y + 0.25), text(size: 7pt)[3. PoW challenge (ML-DSA signed)])

    y += step
    content((col-a + 1.5, y), text(size: 7pt)[4. Mine PoW (GPU)  ·  5. KEM + encrypt + sign])

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
  Bob's ML-KEM-768 encapsulation key and ML-DSA-65 signing key from Bob's
  server via the federation API.
+ Alice's client requests a proof-of-work challenge from Bob's server. The
  request is signed with Alice's ML-DSA-65 signing key to prove her identity.
+ Alice's client mines the challenge on the GPU.
+ Alice encapsulates a fresh shared secret to Bob's ML-KEM-768 key, derives an
  AES-256 key via HKDF-SHA-256, and encrypts the message with AES-256-GCM. She
  also encrypts a second copy to her own ML-KEM key for sent-message history.
  She signs a canonical envelope covering both ciphertexts with ML-DSA-65.
+ Alice sends the ciphertexts, signature, and PoW solution to her server.
+ Alice's server stores her copy, creates a pull token, and notifies
  Bob's server.
+ Bob's server independently resolves Alice's domain via DNS and TLS. It pulls
  the ciphertext, verifies the ML-DSA-65 signature, and stores the message.
+ Bob's client retrieves the ciphertext, decapsulates the shared secret with
  his ML-KEM-768 decapsulation key, and decrypts.

At no point does any server possess the plaintext or the keys needed to derive
it.

= Identity and Addressing

A KeyPears address has the form `name@domain`---intentionally identical to an
email address. The domain is a standard DNS domain. An organization with
existing email addresses can use the same addresses for KeyPears.

Each user holds two types of key pairs:

- *ML-DSA-65 signing key pair* (FIPS~204): a 1,952-byte verifying key and a
  4,032-byte signing key. Used for authenticating PoW challenge requests,
  signing messages, and third-party authentication.
- *ML-KEM-768 encapsulation key pair* (FIPS~203): a 1,184-byte encapsulation
  key and a 2,400-byte decapsulation key. Used for encrypting messages.

Two key pairs are necessary because ML-DSA and ML-KEM are fundamentally
different algorithms that cannot substitute for each other---unlike classical
P-256, which served both signature and key-agreement roles from a single key.

Users may rotate key pairs freely, up to 100 per account. Old keys are retained
so that messages encrypted under previous keys can still be decrypted. Private
keys are encrypted client-side with AES-256-GCM under the user's encryption key
(Section~5) and stored on the server as ciphertext.

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
is cached on the client and used to encrypt and decrypt ML-DSA signing keys
and ML-KEM decapsulation keys. It is never sent to the server.

*Tier 2b: Password Key #sym.arrow Login Key.* A parallel 300,000-round PBKDF2
derivation with a different salt produces the login key. This key is sent to
the server exactly once, then discarded. The server hashes it with an
additional 600,000 rounds using a per-user salt before storage.

The encryption key and login key are derived from the same parent with
different salts, making them cryptographically independent. An attacker who
compromises client storage obtains the encryption key but cannot derive the
login key or impersonate the user on the server.

*Vault key.* A separate key for encrypting stored secrets is derived as
$K_"vault" = "HMAC-SHA-256"(K_"encryption",$ `"vault-key-v2"`$)$. Each vault
entry is independently encrypted with AES-256-GCM under $K_"vault"$.

= Encryption

KeyPears uses AES-256-GCM (NIST SP 800-38D) for all symmetric encryption.
Two encryption modes are used.

*Message encryption.* When Alice sends a message to Bob, she encapsulates a
fresh shared secret to Bob's ML-KEM-768 encapsulation key. The AES-256 key is
derived via HKDF-SHA-256 (RFC~5869):

$ K_"AES" = "HKDF-SHA-256"("salt" = 0^(32), "IKM" = K_"shared", "info" = "webbuf:aesgcm-mlkem v1") $

The message payload is encrypted with AES-256-GCM using $K_"AES"$, with the
sender and recipient addresses bound as Additional Authenticated Data (AAD).

Because ML-KEM is a key encapsulation mechanism rather than a key agreement
protocol, only the recipient can decapsulate the shared secret. The sender
therefore encrypts a second copy to their own ML-KEM key for sent-message
history. Both the KEM ciphertext and the AES ciphertext are stored per message.

*Message signing.* ML-KEM encryption alone does not authenticate the
sender---anyone with the recipient's public encapsulation key can encapsulate.
The sender signs a canonical length-prefixed envelope with ML-DSA-65:

#align(center)[
  #text(size: 9pt)[`"KeypearsMessageV1"` ∥ sender address ∥ recipient address ∥
  signing key ∥ encap key ∥ recipient ciphertext ∥ sender ciphertext]
]

Each field is length-prefixed (4-byte big-endian length + data). The recipient
verifies this signature before trusting the message content.

*Vault encryption.* The vault stores secrets---passwords, credentials, and
notes---encrypted under the vault key derived from the encryption key
(Section~5). The server stores ciphertext alongside user-provided plaintext
labels to enable server-side search without revealing secret content.

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

    // Pattern 1: Self-hosted
    let x1 = 1.5
    rect((x1 - box-w / 2, 0), (x1 + box-w / 2, box-h))
    content((x1, box-h / 2), text(size: 8pt)[`acme.com`\ address + API])
    content((x1, -0.4), text(size: 7pt, weight: "bold")[Self-hosted])

    // Pattern 2: Subdomain
    let x2 = x1 + gap
    rect((x2 - box-w / 2, 0.9), (x2 + box-w / 2, 0.9 + box-h))
    content((x2, 0.9 + box-h / 2), text(size: 8pt)[`acme.com`\ address domain])

    rect((x2 - box-w / 2, -0.6), (x2 + box-w / 2, -0.6 + box-h))
    content((x2, -0.6 + box-h / 2), text(size: 8pt)[`kp.acme.com`\ API server])

    line((x2, 0.9), (x2, -0.6 + box-h), mark: (end: ">"))
    content((x2 + 2.3, 0.5), text(size: 7pt)[keypears.json])
    content((x2, -1.0), text(size: 7pt, weight: "bold")[Subdomain])

    // Pattern 3: Third-party
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
resolves the sender's domain via DNS and TLS---it does not trust the
notification. The recipient pulls the ciphertext, verifies the ML-DSA-65
message signature, and stores the message. This design provides domain
verification without server signing keys.

= Third-Party Authentication

KeyPears provides a redirect-based authentication protocol that allows any
third-party application to verify a user's identity. The flow requires no API
keys, no client registration, and no pre-existing relationship between the
application and the KeyPears server---unlike OAuth, which requires client
registration with each identity provider.

+ The user types their domain (e.g., `example.com`) on the third-party
  application.
+ The application fetches `keypears.json` from the user's domain to discover
  the API domain.
+ The application redirects the user's browser to the KeyPears server's `/sign`
  page with a structured signing request.
+ The user reviews a consent screen and approves. The KeyPears server generates
  a nonce, timestamp, and expiry, and the user signs a canonical JSON payload
  with their ML-DSA-65 key.
+ The signed response is submitted back to the application via HTTP POST (POST
  is required because ML-DSA-65 signatures are 3,309 bytes, exceeding URL
  length limits).
+ The application verifies the signature by fetching the user's signing key via
  federation, reconstructing the canonical payload, and calling ML-DSA-65
  verify.

The user's address is not revealed to the application until they explicitly
approve on the KeyPears server, providing identity privacy. Users can create
per-application addresses for untrusted services.

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
with their ML-DSA-65 signing key. The recipient's server verifies the
signature by looking up the sender's signing key via federation. Both sender
and recipient addresses are bound into the challenge. This prevents
social-graph probing: an unauthenticated party cannot discover whether two
users have communicated.

= Security Analysis

== Server Compromise

The server stores encrypted message bodies and secret payloads alongside hashed
credentials (login key hashed with 600,000 additional rounds of
PBKDF2-HMAC-SHA-256). An attacker who captures the database cannot decrypt
message content or secret payloads. Metadata (addresses, vault labels, channel
counterparties) is stored in plaintext. Brute forcing the login key directly is
infeasible ($2^(256)$ search space). The only realistic attack is a dictionary
attack against the user's password, requiring 1,200,000 rounds of
PBKDF2-HMAC-SHA-256 per guess.

== Quantum Resistance

All asymmetric cryptography uses NIST-finalized post-quantum standards.
ML-DSA-65 and ML-KEM-768 are based on the Module-LWE/SIS hardness
assumptions, which are not known to be efficiently solvable by quantum
computers. Grover's algorithm provides only a quadratic speedup against the
symmetric primitives (AES-256-GCM, SHA-256, PBKDF2), reducing their effective
security to 128 bits---still well within safe margins. Proof-of-work difficulty
is calibrated for classical clients; Grover-style speedups do not expose user
keys or plaintext, but difficulty assumptions may need retuning if quantum
mining hardware becomes practical.

== Spam and Sybil Attacks

Every account creation, login, and message requires proof of work, and the
difficulty is tunable. The cost of an attack scales linearly with the number
of targets and with the difficulty level.

== Domain Spoofing

The pull model prevents domain spoofing without additional signing
infrastructure. The recipient's server independently resolves the sender's
domain via DNS and TLS. A malicious server cannot forge another domain's
identity because TLS guarantees the response came from the real domain.

== Client Storage Theft

An attacker who compromises client storage obtains the encryption key, which
can decrypt the user's ML-DSA signing keys and ML-KEM decapsulation keys.
However, the login key is a cryptographic sibling (derived from the same parent
with a different salt), not a child. The attacker cannot impersonate the user
on the server.

== Limitations

KeyPears does not protect against compromised endpoints, weak passwords, or
DNS-level attacks such as BGP hijacking. The protocol does not provide forward
secrecy in the Signal sense; messages persist on the server for later retrieval,
limiting the practical benefit of ephemeral key material. ML-DSA and ML-KEM are
both lattice-based (Module-LWE); a structural break against this assumption
family would compromise both. SLH-DSA (FIPS~205), a hash-based signature
scheme, exists as a conservative fallback but is not currently used due to its
substantially larger signatures (8--50~KB). The Rust PQC libraries used by this
implementation (RustCrypto `ml-kem`, `ml-dsa`, `slh-dsa`) have not received an
independent third-party audit as of this writing.

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
    [Post-quantum], [No], [KEM only], [No], [Full (KEM+sig)],
    [3rd-party auth], [No], [No], [No], [Yes],
    [Open source], [Yes], [Yes], [Yes], [Yes],
  ),
  caption: [Comparison of encrypted communication systems.],
)

*PGP* (1991) provides strong cryptography but requires manual key management.
*Signal* (2013) solved usability with automatic key management, but is
centralized and has only partially migrated to post-quantum cryptography:
Signal's PQXDH protocol~#cite(<moxie2016>) uses ML-KEM for key exchange, but
identity signatures remain Ed25519 (classical). *Matrix* (2014) is
federated and encrypted, but uses a proprietary address format and a
substantially more complex architecture. *Keybase* (2014) combined social-proof
identity with encryption, but was acquired by Zoom in 2020---a cautionary
example of centralized hosting. KeyPears is, to our knowledge, the first
federated messaging system with full post-quantum cryptography for both key
exchange and signatures.

= Future Work

Several extensions are planned. *Group messaging* with multi-party key
agreement would extend the protocol beyond pairwise communication. *SLH-DSA
fallback support* would provide assumption diversity against a potential
structural break in lattice cryptography. *Public-key transparency logs* would
provide auditability for key rotations. A *native mobile client* with
hardware-backed key storage would improve security for the encryption key.

= Conclusion

Email demonstrated that federated, human-readable addressing can achieve
universal reach. But email's design assumed trusted networks, and four decades
of effort have failed to retrofit encryption and spam resistance. Centralized
alternatives solved these problems by abandoning federation. KeyPears takes a
different path: a clean-sheet protocol that preserves `name@domain` addressing
and DNS-based federation while making post-quantum key encapsulation, message
signing, and proof of work mandatory from the start. The result is a system
where encryption is the only mode, spam is computationally expensive, identity
authentication requires no passwords or API keys, and no single entity controls
identity---built on cryptography designed to withstand the next generation of
computing.

// --- References ---

#bibliography(title: "References", style: "ieee", "references.yml")
