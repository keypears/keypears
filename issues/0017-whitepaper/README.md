+++
status = "open"
opened = "2026-04-11"
+++

# KeyPears Whitepaper

## Goal

Write a whitepaper for KeyPears that clearly communicates the system's design
and value proposition. The paper should be concise, technically precise, and
compelling enough to attract developers, domain operators, and security-minded
users to the platform. Published at `keypears.com/keypears.pdf`, built with
Typst in the `whitepaper/` directory.

## Background

A two-page draft already exists at `whitepaper/keypears.typ` (3 pages as
rendered). It covers the core sections — introduction, identity, key derivation,
encryption, federation, proof of work, threat model, future work, and conclusion
— but reads as a technical overview rather than a persuasive paper.

The most impactful whitepapers in this space share common traits worth studying:

- **Bitcoin (Nakamoto, 2008)** — 9 pages. Opens with the problem (trusted third
  parties), not the solution. Every section builds on the previous one. No
  jargon without justification. Includes a probability analysis that gives the
  paper quantitative credibility. No marketing language — the design speaks for
  itself.

- **Signal Protocol (Marlinspike & Perrin, 2016)** — Focused on the
  cryptographic protocol, not the product. Formal enough to be cited
  academically but readable by practitioners.

- **Matrix (Jacob et al.)** — Describes a federated protocol for decentralized
  communication. Useful comparison point since KeyPears is also federated but
  makes different tradeoffs (PoW instead of rate limiting, pull instead of push,
  ECDH instead of Double Ratchet).

Common patterns in high-impact whitepapers:

1. **Problem-first framing.** The reader should understand why the system exists
   before learning how it works.
2. **Minimal prerequisites.** The paper should be self-contained — a reader
   familiar with public-key cryptography should be able to follow everything.
3. **Diagrams.** Protocol flows, key derivation trees, and federation topology
   are easier to understand visually.
4. **Quantitative claims.** PoW difficulty, KDF round counts, and key sizes
   should be stated precisely with security-level context (e.g., "128-bit
   equivalent security").
5. **Honest limitations.** Stating what the system does _not_ protect against
   builds credibility.
6. **Concise length.** Bitcoin is 9 pages. Signal's core spec is ~30 pages but
   each section is tight. Padding destroys impact.

### What the current draft is missing

- **Problem statement.** The introduction jumps to the solution too quickly.
  Needs a clear articulation of what's broken today and why existing solutions
  (centralized messengers, PGP, Signal, Matrix) don't fully address it.
- **Protocol diagrams.** Key derivation tree, message send/receive flow, and
  federation topology would make the paper far more accessible.
- **Security analysis with numbers.** The threat model section lists threats but
  doesn't quantify security levels. How expensive is a brute-force attack? What
  is the cost of spamming 1,000 accounts?
- **Comparison to related work.** How does KeyPears differ from Signal, Matrix,
  PGP, Keybase? What tradeoffs does it make and why?
- **Formal protocol description.** The current draft describes mechanisms in
  prose. Key exchange, message encryption, and federation should have precise
  step-by-step protocol descriptions.

### Target length

8--12 pages. Long enough to be thorough, short enough to be read in one sitting.

---

## Experiment 1: Study reference whitepapers

### Source materials

Three reference papers were downloaded to `whitepaper/`:

- `bitcoin.pdf` — Nakamoto, "Bitcoin: A Peer-to-Peer Electronic Cash System"
  (2008), 9 pages.
- `signal-x3dh.pdf` — Marlinspike & Perrin, "The X3DH Key Agreement Protocol"
  (2016), 11 pages.
- `signal-doubleratchet.pdf` — Perrin & Marlinspike, "The Double Ratchet
  Algorithm" (2025 rev 4), 45 pages.
- Matrix specification studied online at `spec.matrix.org/latest/`.

### Analysis

#### Bitcoin whitepaper

**Structure:** Abstract, 12 numbered sections, references. No table of contents.

**What makes it work:**

1. _Problem-first introduction._ The entire first page is about what's broken
   (trusted third parties, mediation costs, fraud, privacy). The solution
   ("what is needed is...") appears only in the final paragraph of the
   introduction. The reader understands the pain before seeing the fix.

2. _Each section builds on the last._ Transactions → Timestamp Server →
   Proof-of-Work → Network → Incentive. No section makes sense without the
   previous one. This creates momentum — the reader can't stop mid-paper.

3. _Diagrams at every key concept._ Transaction chains (p2), timestamp chains
   (p2), block structure (p3), Merkle trees (p4), simplified verification (p5),
   transaction structure (p5), privacy model comparison (p6). Seven diagrams in
   9 pages. Every non-obvious data flow gets a picture.

4. _Quantitative security analysis._ Section 11 ("Calculations") models the
   attacker as a Gambler's Ruin problem, derives the probability formula, and
   includes C code and numerical results. This isn't hand-waving — it's a
   concrete proof that the system works with specific numbers.

5. _Concrete numbers for practical concerns._ "80 bytes × 6 × 24 × 365 =
   4.2MB per year" (p4). The reader can verify this on the back of an envelope.

6. _No marketing language._ Zero adjectives like "revolutionary" or "novel."
   The design speaks for itself. Credibility comes from precision, not claims.

7. _Short references list._ 8 citations, all directly relevant. No padding.

**Relevant for KeyPears:** The problem-first framing is the biggest lesson. Our
current draft jumps straight to "KeyPears bridges this gap." We need to spend
more time on what's broken: centralized messengers own your identity, PGP is
unusable, Signal is centralized, Matrix is complex. The quantitative analysis is
also directly applicable — we can compute the cost of brute-forcing a password
(300k BLAKE3 rounds) and the cost of spamming (PoW difficulty × GPU time).

#### Signal X3DH specification

**Structure:** Table of contents, 7 sections (Introduction, Preliminaries, The
Protocol, Security Considerations, IPR, Acknowledgements, References).

**What makes it work:**

1. _Formal preliminaries section._ Before describing the protocol, it defines
   parameters (curve, hash, info), cryptographic notation (DH, KDF, Sig), roles
   (Alice, Bob, server), and key types (IK, EK, SPK, OPK) in precise tables.
   Nothing is ambiguous.

2. _Concise protocol description._ The actual protocol is 3 pages: publishing
   keys, sending the initial message, receiving the initial message. Each is a
   numbered list of concrete steps with exact DH computations (DH1 = DH(IK_A,
   SPK_B), etc.).

3. _Single key diagram._ Figure 1 (p6) shows the four DH computations between
   Alice and Bob's keys with crossed lines. One diagram explains the entire key
   agreement.

4. _Thorough security considerations._ Eight subsections covering
   authentication, replay, key reuse, deniability, signatures, key compromise,
   server trust, and identity binding. Each is 1--2 paragraphs, not exhaustive
   — but each names the attack and states the mitigation or limitation.

5. _Explicit scope boundaries._ "Methods for doing this are outside the scope
   of this document" appears multiple times. The paper knows what it is and
   isn't.

**Relevant for KeyPears:** The preliminaries section is something our draft
completely lacks. We should define our notation (BLAKE3-MAC, ACS2, ECDH) and
key types (password key, encryption key, login key, vault key) before describing
protocols. The security considerations structure — one subsection per attack
vector — is more rigorous than our current bullet list.

#### Signal Double Ratchet specification

**Structure:** Table of contents, 10 sections, 45 pages. Much longer than X3DH
because it includes multiple protocol variants (basic, header encryption,
post-quantum).

**What makes it work:**

1. _Layered explanation._ Section 2 ("Overview") builds concepts incrementally:
   KDF chains → symmetric-key ratchet → Diffie-Hellman ratchet → Double
   Ratchet → out-of-order messages. Each subsection introduces one concept with
   a diagram. Section 3 then gives the formal specification.

2. _Colored diagrams._ KDF chain diagrams use color to distinguish keys,
   inputs, and outputs. The visual hierarchy makes complex key derivation chains
   scannable.

3. _Pseudocode for the protocol._ Sections 3.4/3.5 give encrypt/decrypt
   algorithms as pseudocode with explicit state variable mutations. This is
   unambiguous enough to implement from.

4. _Separate "security considerations" section._ 11 subsections covering
   specific attacks (harvest now/decrypt later, implementation fingerprinting,
   etc.), each 1--3 paragraphs.

**Relevant for KeyPears:** The layered explanation approach (overview with
diagrams, then formal spec) is the right pattern for our KDF and message
encryption sections. Our three-tier KDF would benefit from a diagram like the
KDF chain diagrams. Pseudocode for the message send/receive flow would make
the protocol implementable by third parties.

#### Matrix specification

**Structure:** 8 major components (Client-Server API, Server-Server API,
Application Service API, Identity Service API, Push Gateway API, Room Versions,
Olm/Megolm crypto, Appendices). Online specification, not a standalone paper.

**What makes it work:**

1. _Clear design philosophy._ Five principles stated upfront: open/pragmatic,
   federated, user-empowered, decentralized, historically informed. Each is one
   sentence.

2. _Event-based data model._ Everything is an "event" — an extensible JSON
   object. This single abstraction unifies the entire protocol.

3. _Federation framed as the core value._ "Each homeserver stores communication
   history... and shares data with the wider Matrix ecosystem by synchronising
   communication history with other homeservers."

**Relevant for KeyPears:** Matrix is the closest comparison point for
federation. Our paper should explicitly contrast KeyPears' pull model with
Matrix's push/sync model, and explain why pull is better for our threat model
(domain verification via independent DNS resolution, no trust in the sender's
server). The design philosophy section is worth emulating — a short list of
principles before the technical content.

### Synthesis: qualities to adopt for the KeyPears whitepaper

1. **Problem-first introduction** (Bitcoin). Spend the first page on what's
   broken. Centralized messengers, PGP usability, Signal's centralized
   identity, Matrix's complexity. The solution appears only after the problem
   is felt.

2. **Formal preliminaries** (Signal X3DH). Define notation, key types, and
   roles before describing protocols. A table of cryptographic primitives
   (BLAKE3, secp256k1, ACS2) with their parameters.

3. **Diagrams for every non-obvious flow** (Bitcoin, Signal). At minimum:
   - Three-tier KDF tree (password → password key → encryption key / login
     key)
   - Message send/receive sequence diagram (ECDH, encrypt, pull-model
     delivery)
   - Federation topology (self-hosted, subdomain, third-party)
   - PoW challenge/response flow

4. **Layered explanation** (Double Ratchet). Overview with intuition first,
   then precise protocol steps. Don't mix the two.

5. **Quantitative security analysis** (Bitcoin). Compute concrete numbers:
   - Cost to brute-force a password (300k BLAKE3 rounds × charset × length)
   - Cost to spam N accounts (N × 70M difficulty × GPU time per hash)
   - Key space (secp256k1 = 128-bit security level)

6. **Structured security considerations** (Signal X3DH). One subsection per
   attack vector, not a bullet list. Name the attack, state the mitigation,
   acknowledge limitations.

7. **Explicit scope boundaries** (Signal X3DH). State what's out of scope
   (endpoint security, DNS-level attacks, group messaging) rather than
   pretending the system handles everything.

8. **Comparison to related work** (unique to our needs). A section comparing
   KeyPears to Signal, Matrix, PGP, and Keybase — what tradeoffs each makes
   and why KeyPears chose differently.

9. **No marketing language** (Bitcoin). Let the design speak. Credibility
   comes from precision.

10. **Design principles upfront** (Matrix). A short list of core values
    (federated, E2E encrypted, client-side PoW, DNS-based identity) before
    diving into technical detail.

### Result

Research complete. These ten qualities should guide the structure and tone of
the full whitepaper rewrite in the next experiment.
