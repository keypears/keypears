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

---

## Experiment 2: Study the problem space

### Hypothesis

KeyPears solves a suite of related problems that are well-documented
individually but rarely synthesized together. The core insight is that email
— the internet's original federated communication protocol — has two
fundamental deficiencies that are nearly impossible to fix in a
backwards-compatible way:

1. No cryptographic key exchange, making end-to-end encryption impractical.
2. No cost to send, making spam economically rational.

Studying the prior art on these failures will sharpen the problem statement in
the whitepaper's introduction and provide citable references.

### Source materials

Four documents were downloaded to `whitepaper/`:

- `whitten-tygar-1999-why-johnny-cant-encrypt.pdf` — Whitten & Tygar, "Why
  Johnny Can't Encrypt: A Usability Evaluation of PGP 5.0" (USENIX Security,
  1999), 14 pages.
- `back-2002-hashcash.pdf` — Back, "Hashcash - A Denial of Service
  Counter-Measure" (2002), 10 pages.
- `rfc7489-dmarc.txt` — Kucherawy & Zwicky, "Domain-based Message
  Authentication, Reporting, and Conformance (DMARC)" (RFC 7489, 2015).
- `marlinspike-2016-ecosystem-is-moving.html` — Marlinspike, "Reflections: The
  ecosystem is moving" (Signal blog, 2016).

### Analysis

#### "Why Johnny Can't Encrypt" (Whitten & Tygar, 1999)

The canonical demonstration that bolting encryption onto email doesn't work.

**Key findings:**

1. _Security is a secondary goal._ Users don't sit down to "do encryption" —
   they sit down to send email. Security that requires extra steps will be
   skipped. PGP's fundamental problem is that encryption is opt-in and requires
   manual key management.

2. _The user test was devastating._ Given 90 minutes with PGP 5.0, the majority
   of participants could not successfully sign and encrypt a message. Many
   accidentally sent plaintext, thought they had encrypted when they hadn't, or
   encrypted to the wrong key.

3. _Five problematic properties of security:_ unmotivated user (security is a
   secondary goal), abstraction (key management is conceptually alien),
   lack of feedback (hard to tell if you're secure), barn door (one mistake
   exposes everything permanently), weakest link (one user's error compromises
   the conversation).

4. _Key management is the core failure._ Users couldn't understand the
   relationship between public and private keys, couldn't use key servers
   reliably, and confused encryption with signing. The web of trust was
   incomprehensible to non-experts.

**Lesson for KeyPears:** This paper validates our entire design philosophy.
KeyPears eliminates every failure mode Whitten & Tygar identified:

- Encryption is not opt-in — it's the only mode. There is no "send plaintext"
  button.
- Key management is invisible. The server stores encrypted private keys; the
  user only knows their password. Key rotation, key lookup for recipients, and
  ECDH computation happen automatically.
- There is no web of trust. Identity is bound to DNS domains, which users
  already understand from email.
- Feedback is immediate — you either have a conversation or you don't. There's
  no state where you think you're encrypted but aren't.

The whitepaper should cite this paper when arguing that retrofitting encryption
onto existing protocols has been tried and has failed, not due to cryptographic
weakness but due to usability.

#### Hashcash (Back, 2002)

The foundational paper on proof-of-work as anti-spam. Hashcash was originally
proposed for email in 1997 — the exact same idea KeyPears uses, but applied to
SMTP.

**Key concepts:**

1. _Cost functions._ A cost function is "efficiently verifiable, but
   parameterisably expensive to compute." The key properties are: publicly
   auditable (anyone can verify), trapdoor-free (the server has no advantage in
   minting), and probabilistic cost (expected time is predictable but actual
   time is random).

2. _Interactive vs non-interactive._ Non-interactive hashcash (for email) has
   no challenge — the client chooses its own start value. Interactive hashcash
   (for TCP/TLS) uses a server-issued challenge. KeyPears uses the interactive
   variant: the server issues a BLAKE3-MAC-signed challenge with a 15-minute
   expiry.

3. _Hashcash-cookies._ Section 4.2 describes a technique where the server MACs
   the challenge parameters so it doesn't need to store state. "The server
   would not need to keep any state per connection prior to receiving the TCP
   ACK." This is exactly what KeyPears does — stateless challenges via
   BLAKE3-MAC, with no DB entry until verification.

4. _The spent-token database._ Section 3 notes: "The server needs to keep a
   double spending database of spent tokens." This is KeyPears' `used_pow`
   table. Back even notes the expiry/cleanup pattern: "The server can discard
   entries from the spent database after they have expired."

5. _Why it wasn't adopted for email._ Hashcash was never widely deployed for
   email because SMTP has no mechanism to negotiate PoW between sender and
   receiver. You can't require PoW from senders who don't know about it, and
   backwards compatibility means you can't reject mail without it. This is the
   clean-sheet argument: a new protocol can make PoW mandatory from day one.

**Lesson for KeyPears:** Hashcash is the most important citation for the PoW
section. KeyPears' PoW system is a direct descendant of Hashcash, adapted for
an interactive web protocol with GPU mining. The whitepaper should cite Back's
original work and explain what changed: interactive challenges (server-issued,
not self-selected), GPU mining (WebGPU instead of CPU), per-recipient
configurability (users choose their own difficulty), and authenticated
challenges (secp256k1 signatures prevent probing).

The whitepaper should also use Hashcash's failure to gain adoption on email as
evidence that the spam problem can only be solved by a clean-sheet protocol.

#### DMARC (RFC 7489, 2015)

The most recent attempt to retrofit authentication onto email. DMARC layers on
top of two earlier mechanisms (SPF and DKIM) to let domain owners publish
policies about how to handle unauthenticated mail.

**Key observations:**

1. _Three layers of complexity._ DMARC requires SPF (IP-based sender
   authorization), DKIM (cryptographic message signing), and DMARC itself
   (policy and reporting). Each has its own DNS records, failure modes, and
   deployment challenges. This is the cost of backwards compatibility.

2. _"Identifier alignment" is the core problem._ Section 3.1 spends multiple
   pages defining when the domain in the From header "aligns" with the domain
   authenticated by SPF or DKIM. The complexity arises because email has
   multiple sender identifiers (MAIL FROM, From header, DKIM d= domain) that
   can all be different. A clean-sheet protocol doesn't have this problem.

3. _It's informational, not a standard._ The RFC header says "This document is
   not an Internet Standards Track specification; it is published for
   informational purposes." After years of effort, email authentication still
   isn't a formal internet standard.

4. _It doesn't encrypt anything._ DMARC authenticates the sender's domain but
   provides zero confidentiality. The message content is still plaintext. This
   is half a solution at best.

**Lesson for KeyPears:** DMARC is the proof that even authentication alone
(never mind encryption) is extraordinarily hard to retrofit onto email. The
whitepaper should cite DMARC as evidence of the complexity cost of backwards
compatibility, and contrast it with KeyPears' approach: authentication and
encryption are built into the protocol from the start, not layered on after
40 years.

#### "The ecosystem is moving" (Marlinspike, 2016)

Moxie's argument against federation and for centralization.

**Key arguments:**

1. _Federation freezes protocols in time._ "We got to HTTP version 1.1 in 1997,
   and have been stuck there until now. Likewise, SMTP, IRC, DNS, XMPP, are
   all similarly frozen in time circa the late 1990s." Federated protocols
   can't evolve because all participants must agree on changes.

2. _Centralization enables iteration._ "WhatsApp was able to introduce
   end-to-end encryption to over a billion users with a single software
   update." Federation can't do this.

3. _XMPP's "extensible" federation failed._ Extensions don't matter if not
   everyone implements them. "Fractured client support is often worse than no
   client support at all."

4. _Federation coalesces around one provider anyway._ "Every email I send or
   receive seems to have Gmail on the other end of it." Self-hosting is the
   worst of both worlds — you get the complexity of federation without the
   metadata protection it promises.

5. _Switching costs are now low._ Phone-number-based identity means users can
   switch messaging apps easily, giving centralized services implicit
   competitive pressure without needing federation.

**Lesson for KeyPears:** This is the strongest counterargument to KeyPears'
federated design, and the whitepaper should address it directly. KeyPears'
response:

- Federation doesn't have to freeze the protocol if the protocol is simple
  enough. KeyPears' federation layer is minimal — `keypears.json` for
  discovery, one pull-token API for message delivery. There are no XEPs.
- KeyPears addresses the "coalesce around one provider" problem by making
  identity domain-based rather than phone-number-based. If you own your
  domain, you own your identity. Switching providers means changing a DNS
  record, not changing your address.
- KeyPears is explicitly not trying to compete with consumer messengers on
  feature velocity. It's a protocol for secure secret exchange, not a social
  network. The feature set is deliberately small and stable.
- The tradeoff is real and should be stated honestly: KeyPears sacrifices
  iteration speed for sovereignty. Organizations that need to control their
  own communication infrastructure accept this tradeoff.

### Synthesis: framing the problem statement

The four sources converge on a single narrative for the whitepaper's
introduction:

1. **Email is the internet's original federated communication protocol.** It
   got addressing right (`name@domain`), federation right (SMTP + MX records),
   and ubiquity right. But it was designed in an era that assumed trusted
   networks.

2. **Two fundamental deficiencies have proven impossible to fix
   retroactively:**
   - _No key exchange._ Without cryptographic keys bound to identities, E2E
     encryption requires manual key management (PGP), which Whitten & Tygar
     proved unusable in 1999. 25+ years later, encrypted email is still a
     niche practice.
   - _No cost to send._ Without proof of work, spam is economically rational.
     Hashcash (Back, 1997/2002) proposed the solution but couldn't deploy it
     on SMTP because backwards compatibility prevents making it mandatory.

3. **Layering fixes on top hasn't worked.** DMARC (2015) required three
   interlocking mechanisms (SPF, DKIM, DMARC) just to authenticate the
   sender's domain — and still doesn't encrypt anything. The complexity is a
   direct consequence of backwards compatibility with 40 years of SMTP.

4. **Centralized alternatives traded one problem for another.** Signal solved
   encryption but centralized identity. WhatsApp solved usability but gave
   metadata to Facebook. As Marlinspike argued (2016), centralization enables
   iteration — but it also means a single entity controls your address, your
   keys, and your social graph.

5. **KeyPears is a clean-sheet protocol that keeps what email got right**
   (federated `name@domain` addressing, domain-based discovery) **while adding
   what it couldn't:** Diffie-Hellman key exchange for end-to-end encryption,
   and proof of work for spam mitigation. Both are mandatory from day one, not
   retrofitted.

### Result

Research complete. The five-point narrative above should structure the
whitepaper's introduction. Citations: Whitten & Tygar 1999, Back 2002,
RFC 7489 (DMARC), Marlinspike 2016.

---

## Experiment 3: Benchmark and verify all quantitative claims

### Hypothesis

The whitepaper makes several quantitative claims about computation times and
costs. These should be verified empirically rather than estimated, and the
numbers in the paper should be generated by a program so they can be updated
as hardware changes.

### Claims to verify

1. **PoW mining times** (Section 8, Table 1):
   - Difficulty 70M takes ~15 seconds
   - Difficulty 7M takes ~1--2 seconds

2. **BLAKE3 PBKDF rate** (Section 9.2):
   - "BLAKE3 processes approximately 1 billion hashes per second on a modern
     GPU"
   - 300,000 rounds per password guess takes ~300 microseconds
   - 8-char lowercase+digits password ($36^8$) exhaustive search takes ~27
     GPU-years

3. **Spam cost** (Section 9.3):
   - 1,000 accounts takes ~4 GPU-hours
   - 10,000 first messages takes ~42 GPU-hours

### Approach

Write three programs in `whitepaper/`:

**1. `bench-pow/`** — A small webapp (HTML + JS) that runs in Google Chrome.
Uses the `@keypears/pow5` WebGPU implementation to mine PoW at several
difficulty levels and measure the GPU hash rate. Displays results on the page
in a copy-pasteable format. The user opens the page in Chrome, waits for the
benchmarks to complete, and copies the output.

**2. `bench-blake3.ts`** — CLI benchmark (runs with `bun`). Measures BLAKE3
rounds per second by running `blake3Mac` in a loop for a fixed duration.
Outputs the measured rate.

**3. `calc-whitepaper-numbers.ts`** — CLI calculator (runs with `bun`). Takes
the GPU hash rate (from step 1, pasted as a CLI argument) and the BLAKE3 rate
(from step 2) as inputs. Produces all derived numbers used in the whitepaper:
   - PoW mining time for each difficulty level (7M, 70M)
   - Time per password guess (300k BLAKE3 rounds)
   - Exhaustive search time for various password strengths
   - Spam cost (accounts and messages)
   - Outputs a plain-text summary ready to be used when updating the whitepaper

### Workflow

1. Run `bun whitepaper/bench-blake3.ts` — get BLAKE3 rate.
2. Open `whitepaper/bench-pow/index.html` in Chrome — get GPU hash rate.
   Copy the output and paste it back.
3. Run `bun whitepaper/calc-whitepaper-numbers.ts <gpu-rate> <blake3-rate>` —
   get all whitepaper numbers.
4. Update any incorrect claims in the whitepaper with the calculated values.

### Pass criteria

- All benchmarks run successfully.
- The calculator produces numbers consistent with (or correcting) the
  whitepaper's current claims.
- Any incorrect claims in the whitepaper are updated with empirically derived
  values.
