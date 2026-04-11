#import "@preview/cetz:0.3.4"

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
  *Abstract.* KeyPears is a federated protocol for end-to-end encrypted
  communication and secret management. User identities are email-style
  addresses (`name@domain`) backed by secp256k1 key pairs. Any domain can
  host a KeyPears server, and servers discover each other through DNS and a
  well-known configuration file. All cryptographic operations---key derivation,
  Diffie-Hellman key exchange, encryption, and proof of work---execute
  client-side. Servers store only ciphertext and never possess the keys needed
  to decrypt it. A proof-of-work mechanism provides Sybil resistance for
  account creation, authentication, and messaging without CAPTCHAs or
  third-party services. This paper describes the protocol design, cryptographic
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
compatibility prevents making it mandatory: a server that rejects mail without
proof of work would lose legitimate messages from senders who have never heard
of Hashcash.

Attempts to layer fixes onto email have produced extraordinary complexity.
DMARC~#cite(<rfc7489>), published in 2015, requires three interlocking
mechanisms---SPF for IP-based sender authorization, DKIM for cryptographic
message signing, and DMARC itself for policy and reporting. Each has its own
DNS records, failure modes, and deployment challenges. After years of effort,
DMARC authenticates the sender's domain but provides zero confidentiality. The
message content is still plaintext. This is the cost of backwards
compatibility.

Centralized alternatives have taken a different approach. Signal solved
end-to-end encryption for billions of users with a single software update, but
at the cost of centralized identity: your address is a phone number controlled
by a carrier, and a single organization runs every server. As Marlinspike
argued~#cite(<moxie2016>), centralization enables rapid iteration---but it also
means one entity controls your identity, your keys, and your social graph. If
that entity changes policy, you have no recourse except to leave and lose your
address.

We propose a protocol that keeps what email got right---federated
`name@domain` addressing and DNS-based server discovery---while adding what
email could not: Diffie-Hellman key exchange for end-to-end encryption, and
proof of work for spam mitigation. Both are mandatory from day one, not
retrofitted onto a protocol that was never designed for them.

= Design Principles

KeyPears is guided by five principles:

+ *Federated.* Any domain can run a KeyPears server. Servers discover each
  other via DNS. No registration authority controls participation.
+ *End-to-end encrypted.* Servers store only ciphertext. Plaintext never
  leaves the client. The server operator cannot read messages or vault entries.
+ *Client-side proof of work.* Every account creation, login, and message
  requires proof of work computed in the user's browser. No CAPTCHAs, no
  third-party verification services.
+ *DNS-based identity.* Addresses are `name@domain`. Identity is bound to DNS
  domain ownership, not to a phone number or a central registry. If you own
  your domain, you own your identity.
+ *No trusted third party.* No certificate authority, no central key server, no
  phone-number registry. Domain verification relies on standard HTTPS/TLS.

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
    content(((col-a + col-as) / 2, y + 0.25), text(size: 7pt)[1. Look up Bob's key])

    y += step
    line((col-as, y), (col-bs, y), mark: (end: ">"))
    content(((col-as + col-bs) / 2, y + 0.25), text(size: 7pt)[2. `getPublicKey`])

    y += step
    line((col-a, y), (col-bs, y), mark: (end: ">"), stroke: (dash: "dotted"))
    content(((col-a + col-bs) / 2, y + 0.25), text(size: 7pt)[3. PoW challenge (signed)])

    y += step
    content((col-a + 1.5, y), text(size: 7pt)[4. Mine PoW (WebGPU)  ·  5. ECDH + encrypt])

    y += step
    line((col-a, y), (col-as, y), mark: (end: ">"))
    content(((col-a + col-as) / 2, y + 0.25), text(size: 7pt)[6. Ciphertext + PoW])

    y += step
    line((col-as, y), (col-bs, y), mark: (end: ">"))
    content(((col-as + col-bs) / 2, y + 0.25), text(size: 7pt)[7. Notify + pull token])

    y += step
    content((col-bs + 1.8, y), text(size: 7pt)[8. Resolve a.com via DNS/TLS], anchor: "west")

    y += step
    line((col-bs, y), (col-as, y), mark: (end: ">"))
    content(((col-as + col-bs) / 2, y + 0.25), text(size: 7pt)[9. Pull (one-time token)])

    y += step
    line((col-bs, y), (col-b, y), mark: (end: ">"))
    content(((col-bs + col-b) / 2, y + 0.25), text(size: 7pt)[10. Deliver ciphertext])
  }),
  caption: [Message flow: Alice sends an encrypted message to Bob across two federated domains.],
)

+ Alice's browser asks her server for Bob's public key. Her server fetches it
  from Bob's server via the federation API.
+ Alice's browser requests a proof-of-work challenge from Bob's server. The
  request is signed with Alice's secp256k1 private key to prove her identity.
+ Alice's browser mines the challenge on the GPU via WebGPU.
+ Alice computes a shared secret via ECDH (her private key, Bob's public key),
  derives an encryption key with BLAKE3, and encrypts the message with ACB3.
+ Alice sends the ciphertext and PoW solution to her server.
+ Alice's server stores her copy, creates a one-time pull token, and notifies
  Bob's server.
+ Bob's server independently resolves Alice's domain via DNS and TLS---it does
  not trust the notification. It pulls the ciphertext using the token.
+ Bob's browser retrieves the ciphertext, re-derives the ECDH shared secret,
  and decrypts.

At no point does any server possess the plaintext or the keys needed to derive
it.

= Identity and Addressing

A KeyPears address has the form `name@domain`. The name is a lowercase
alphanumeric string (1--30 characters, starting with a letter). The domain is a
standard DNS domain.

Each user holds one or more secp256k1 key pairs. The most recent key is the
active key, used for ECDH key agreement in new messages. Users may rotate keys
freely, up to 100 per account. Old keys are retained so that messages encrypted
under previous keys can still be decrypted.

Private keys are encrypted client-side with ACB3 under the user's encryption
key (Section~5) and stored on the server as ciphertext. The server cannot
decrypt them. If a user changes their password, keys encrypted under the old
password are re-encrypted; keys from a different password remain "locked" until
the user provides the old password.

Identity is bound to domain ownership. An address like `alice@acme.com`
survives changes in hosting provider: if `acme.com` migrates from one KeyPears
server to another, Alice's address and identity remain valid. Only the
`keypears.json` configuration file is updated.

= Key Derivation

Password-based key derivation uses a three-tier BLAKE3 PBKDF scheme, producing
300,000 total rounds between the user's password and the stored hash.

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
    content((center-x + 2.5, -0.4), text(size: 8pt)[100k rounds BLAKE3])

    // Password Key
    let pk-y = -0.8
    rect((center-x - box-w / 2, pk-y - box-h), (center-x + box-w / 2, pk-y))
    content((center-x, pk-y - box-h / 2), [*Password Key* #text(size: 8pt)[(ephemeral)]])

    // Fork left: Encryption Key
    let fork-y = pk-y - box-h
    let left-x = center-x - 3.5
    let right-x = center-x + 3.5

    line((center-x - 0.5, fork-y), (left-x, fork-y - 1.0), mark: (end: ">"))
    content((left-x - 1.2, fork-y - 0.5), text(size: 8pt)[100k rounds\ salt A])

    rect((left-x - box-w / 2, fork-y - 1.0 - box-h), (left-x + box-w / 2, fork-y - 1.0))
    content((left-x, fork-y - 1.0 - box-h / 2), [*Encryption Key*])
    content((left-x, fork-y - 1.0 - box-h - 0.4), text(size: 7pt)[cached in localStorage])

    // Fork right: Login Key
    line((center-x + 0.5, fork-y), (right-x, fork-y - 1.0), mark: (end: ">"))
    content((right-x + 1.2, fork-y - 0.5), text(size: 8pt)[100k rounds\ salt B])

    rect((right-x - box-w / 2, fork-y - 1.0 - box-h), (right-x + box-w / 2, fork-y - 1.0))
    content((right-x, fork-y - 1.0 - box-h / 2), [*Login Key*])
    content((right-x, fork-y - 1.0 - box-h - 0.4), text(size: 7pt)[sent to server once, discarded])

    // Server hashing
    let srv-y = fork-y - 1.0 - box-h - 0.4
    line((right-x, srv-y - 0.3), (right-x, srv-y - 1.1), mark: (end: ">"))
    content((right-x + 2.5, srv-y - 0.7), text(size: 8pt)[100k rounds\ server salt])

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
100,000 rounds of BLAKE3 in keyed-MAC mode using a deterministic salt derived
from the password itself. The result is a 256-bit password key. This key is
ephemeral---it is used to derive the encryption key and login key, then
discarded.

*Tier 2a: Password Key #sym.arrow Encryption Key.* A second 100,000-round
derivation with a distinct salt produces the encryption key. This key is cached
in the browser's `localStorage` and used to encrypt and decrypt secp256k1
private keys client-side. It is never sent to the server.

*Tier 2b: Password Key #sym.arrow Login Key.* A parallel 100,000-round
derivation with a different salt produces the login key. This key is sent to the
server exactly once during account creation or login, then discarded on the
client. The server hashes it with an additional 100,000 rounds before storage.

The encryption key and login key are derived from the same parent with different
salts, making them cryptographically independent. An attacker who compromises
`localStorage` obtains the encryption key and can decrypt private keys on that
device, but cannot derive the login key or impersonate the user on the server.

*Vault key.* A separate vault key for encrypting stored secrets is derived as
$"BLAKE3-MAC"("private key", "vault-key")$. Each vault entry is independently
encrypted with ACB3 under this key.

= Encryption

KeyPears uses ACB3 (AES-256-CBC with BLAKE3-MAC authentication) for all
symmetric encryption. Two encryption modes are used.

*Message encryption.* When Alice sends a message to Bob, she computes a shared
secret via elliptic-curve Diffie-Hellman on secp256k1:

$ S = "BLAKE3"("ECDH"(a, B)) $

where $a$ is Alice's private key and $B$ is Bob's public key. The message
payload is encrypted with ACB3 using $S$ as the key. Both Alice's and Bob's
public keys are stored alongside the ciphertext, so that either party can
re-derive the shared secret after key rotation.

*Vault encryption.* The vault stores secrets---passwords, credentials, and
notes---encrypted under the vault key derived from the user's private key
(Section~5). The server stores ciphertext alongside user-provided plaintext
labels (name and search terms) to enable server-side search without revealing
secret content.

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
    content((x3 + 2.3, 0.5), text(size: 7pt)[keypears.json\ + admin field])
    content((x3, -1.0), text(size: 7pt, weight: "bold")[Third-party hosted])
  }),
  caption: [Three federation patterns. In each case, the address domain (`acme.com`) may differ from the API server.],
)

- *Self-hosted:* The domain and API endpoint are the same host.
- *Subdomain:* The API runs on a subdomain (e.g., `kp.acme.com`), keeping the
  main domain free for other uses.
- *Third-party hosted:* The domain delegates its KeyPears service to another
  operator (e.g., `keypears.com`). An `admin` field in `keypears.json` names
  the authorized administrator.

*Pull-model message delivery.* Cross-domain messages use a pull model rather
than server-to-server push. The sender's server stores the ciphertext and
issues a one-time pull token. It notifies the recipient's server, which
independently resolves the sender's domain via DNS and TLS---it does not trust
the notification. The recipient pulls the ciphertext using the token, which is
consumed on use.

This design provides domain verification without server signing keys. The
recipient discovers the sender's API endpoint by resolving the sender's domain
itself, via HTTPS. A malicious sender cannot forge another domain's identity
because TLS guarantees the `keypears.json` response came from the real domain.

= Proof of Work

Back proposed Hashcash~#cite(<back2002>) in 1997 as a proof-of-work scheme to
make email spam expensive. The idea was correct, but SMTP has no mechanism to
negotiate proof of work, and backwards compatibility prevents making it
mandatory. KeyPears makes proof of work a first-class protocol requirement,
building on Hashcash with four adaptations.

*Interactive challenges.* Hashcash is non-interactive: the sender chooses a
start value and the recipient verifies the result. KeyPears uses interactive
challenges: the recipient's server issues a challenge signed with BLAKE3-MAC,
including a 15-minute expiry. Challenges are stateless---no database entry is
created until a valid solution is submitted. This prevents pre-computation
attacks.

*GPU mining.* All proof of work is computed client-side on the GPU via WebGPU
using the `pow5-64b` algorithm. The mining shader runs natively on the GPU;
servers never mine. A modern GPU solves a difficulty-70M challenge in
approximately 15~seconds and a difficulty-7M challenge in 1--2~seconds.

*Per-recipient configurability.* Each user can set their own PoW difficulty for
incoming messages:

#figure(
  table(
    columns: (auto, auto, auto),
    inset: 8pt,
    align: (left, right, left),
    table.header([*Action*], [*Difficulty*], [*Approx. time*]),
    [Account creation], [70,000,000], [~15 s],
    [Login], [7,000,000], [~1--2 s],
    [First message to user], [70,000,000 (default)], [~15 s],
    [Subsequent messages], [7,000,000 (default)], [~1--2 s],
  ),
  caption: [Default proof-of-work difficulty levels. Message difficulties are configurable per recipient with a server-enforced minimum of 7M.],
)

*Authenticated challenges.* Challenge requests require the sender to sign with
their secp256k1 private key. The recipient's server verifies the signature by
looking up the sender's public key via federation. Both sender and recipient
addresses are bound into the challenge by the server's BLAKE3-MAC. This
prevents social-graph probing: an unauthenticated party cannot discover whether
two users have communicated.

Solutions are recorded in a spent-token table for replay prevention. Expired
entries are cleaned up after their 15-minute window.

= Security Analysis

== Server Compromise

The server stores only ciphertext (messages, vault entries, encrypted private
keys) and hashed credentials (login key hashed with 100,000 additional BLAKE3
rounds). An attacker who captures the database cannot read any user content. To
impersonate a user, the attacker must reverse 200,000 rounds of BLAKE3 PBKDF to
recover the login key, or 300,000 rounds to recover the password.

== Password Brute-Force

An offline attack against the stored hash requires 300,000 BLAKE3 rounds per
guess. BLAKE3 processes approximately 1 billion hashes per second on a modern
GPU. At this rate, a single password guess requires approximately 300
microseconds. For an 8-character password drawn from lowercase letters and
digits ($36^8 approx 2.8 times 10^(12)$ candidates), exhaustive search takes
approximately $2.8 times 10^(12) times 3 times 10^(-4) approx 8.4 times 10^8$
seconds, or roughly 27~years on a single GPU. Longer or more complex passwords
increase this cost exponentially. Online attacks are further throttled by the
login PoW requirement (7M difficulty per attempt).

== Spam and Sybil Attacks

Creating an account requires solving a difficulty-70M proof-of-work challenge,
taking approximately 15~seconds on a modern GPU. Creating 1,000 accounts
requires approximately 4~GPU-hours. Sending a first message to a new recipient
requires an additional 70M-difficulty challenge. Mass spam is economically
impractical: reaching 10,000 users requires approximately 42~GPU-hours of
continuous computation, with no guarantee of delivery since recipients may set
higher difficulty thresholds.

== Social-Graph Probing

Proof-of-work challenge requests are authenticated: the sender must sign the
request with their secp256k1 private key, and the recipient's server verifies
the signature via federation. An unauthenticated party cannot request a
challenge, and therefore cannot probe whether two users have a communication
channel. Both addresses are signed into the challenge payload by the server's
BLAKE3-MAC, preventing cross-conversation reuse.

== Domain Spoofing

The pull model prevents domain spoofing without any additional signing
infrastructure. When Bob's server receives a notification from Alice's domain,
it does not trust the notification's claimed origin. Instead, it independently
resolves Alice's domain via DNS and TLS, fetching `keypears.json` to discover
the API endpoint. A malicious server cannot forge another domain's identity
because TLS guarantees the response came from the real domain.

== LocalStorage Theft

An attacker who compromises a user's `localStorage` obtains the encryption key,
which can decrypt the user's secp256k1 private keys. However, the login key is
a cryptographic sibling of the encryption key (derived from the same parent with
a different salt), not a child. The attacker cannot derive the login key,
cannot impersonate the user on the server, and cannot access the server-side
session. The attack surface is limited to decrypting data already present on
the compromised device.

== Limitations

KeyPears does not protect against compromised endpoints (an attacker with access
to the running browser can read decrypted content), weak passwords (an entropy
meter guides users but does not enforce a minimum), or DNS-level attacks such as
BGP hijacking (mitigated by DNSSEC where deployed). The current protocol does
not provide forward secrecy---messages encrypted with a compromised key can be
decrypted retroactively. Forward secrecy via ratcheted key exchange is planned
as future work.

= Related Work

#figure(
  table(
    columns: (auto, auto, auto, auto, auto),
    inset: 6pt,
    align: left,
    table.header([], [*PGP*], [*Signal*], [*Matrix*], [*KeyPears*]),
    [Identity], [Email address], [Phone number], [User\@server], [`name@domain`],
    [Federation], [Key servers], [None], [Homeservers], [DNS + pull model],
    [E2E encryption], [Manual], [Automatic], [Automatic], [Automatic],
    [Spam mitigation], [None], [Phone reg.], [Rate limits], [Proof of work],
    [Key management], [Manual], [Automatic], [Automatic], [Automatic],
    [Forward secrecy], [No], [Yes], [Yes], [No (planned)],
    [Open source], [Yes], [Yes], [Yes], [Yes],
  ),
  caption: [Comparison of encrypted communication systems.],
)

*PGP* (1991) provides strong public-key cryptography but requires users to
manage keys, verify fingerprints, and navigate a web of trust. Whitten and
Tygar~#cite(<whitten1999>) showed that this model is unusable for ordinary
people. KeyPears eliminates manual key management entirely: keys are generated
automatically, encrypted under the user's password, and exchanged via federation
without user intervention.

*Signal* (2013) solved the usability problem with automatic key management and
the Double Ratchet protocol for forward secrecy. However, Signal is centralized:
identity is bound to phone numbers controlled by carriers, and a single
organization operates all servers. Marlinspike~#cite(<moxie2016>) argued that
centralization is necessary for rapid iteration. KeyPears accepts slower
iteration in exchange for sovereignty: users who own their domain own their
identity, and anyone can run a server.

*Matrix* (2014) is the closest comparison. It is federated, end-to-end
encrypted (via Olm and Megolm), and open-source. However, Matrix's
architecture is substantially more complex: room state is maintained as a
directed acyclic graph synchronized across homeservers, and the specification
spans eight major components. KeyPears makes a deliberate tradeoff toward
simplicity: no rooms, no DAG, no state synchronization. The federation layer is
a single JSON file and one pull-token API. This limits KeyPears to pairwise
communication but dramatically reduces implementation and operational
complexity.

*Keybase* (2014) combined social-proof identity verification with encrypted
messaging and a team-based file system. Its design was sound, but it was
acquired by Zoom in 2020 and effectively shut down---a cautionary example of
centralized hosting for a decentralization-aspirational product. KeyPears
avoids this failure mode by design: identity is bound to DNS domains, not to a
company, and the protocol can be implemented by anyone.

= Future Work

Several extensions are planned. *Group messaging* with multi-party key
agreement would extend the protocol beyond pairwise communication. *Forward
secrecy* via ratcheted key exchange (in the style of Signal's Double
Ratchet~#cite(<doubleratchet>)) would protect past messages if a key is
compromised. *Public-key transparency logs* would provide auditability for key
rotations, allowing users to detect unauthorized key changes. A *native mobile
client* with hardware-backed key storage would improve security for the
encryption key, which is currently cached in browser `localStorage`.

= Conclusion

Email demonstrated that federated, human-readable addressing can achieve
universal reach without central control. But email's design assumed trusted
networks, and four decades of effort have failed to retrofit the two
capabilities it lacks: key exchange for encryption, and proof of work for spam
resistance. Centralized alternatives solved these problems by abandoning
federation, trading sovereignty for convenience. KeyPears takes a different
path: a clean-sheet protocol that preserves `name@domain` addressing and
DNS-based federation while making Diffie-Hellman key exchange and proof of work
mandatory from the start. The result is a system where encryption is the only
mode, spam is computationally expensive, and no single entity controls identity.

// --- References ---

#bibliography(title: "References", style: "ieee", "references.yml")
