+++
status = "open"
opened = "2026-04-24"
+++

# Post-quantum cryptography migration

## Goal

Determine which post-quantum algorithms to use to replace KeyPears' current
quantum-vulnerable cryptography (P-256 ECDSA, P-256 ECDH), and plan the
migration path.

## Background

### The threat

Google Quantum AI published a paper on April 17, 2026 ("Securing Elliptic Curve
Cryptocurrencies against Quantum Vulnerabilities," Babbush et al.,
[arXiv:2603.28846](https://arxiv.org/abs/2603.28846)) demonstrating that
breaking 256-bit ECDLP requires only \~1,200 logical qubits and \~90 million
Toffoli gates. On a superconducting architecture with \~500,000 physical qubits,
this executes in \~9 minutes. This is a 20x reduction from prior estimates.

The paper's central argument: the margin of time remaining before
cryptographically relevant quantum computers (CRQCs) arrive is narrowing, and
migration to post-quantum cryptography (PQC) should begin immediately.

### What's vulnerable in KeyPears

KeyPears uses P-256 for everything:

- **ECDSA signatures** — user identity (signing messages, signing auth
  challenges, PoW request signing). A quantum attacker who knows a public key
  can derive the private key and forge signatures.
- **ECDH key exchange** — message encryption. A quantum attacker can recover the
  shared secret from the two public keys and decrypt all messages.
- **Public key exposure** — KeyPears exposes public keys via the federation API
  (`getPublicKey`). Every user's public key is discoverable by anyone, making
  all keys vulnerable to at-rest attacks (no time pressure on the attacker).

### What's NOT vulnerable

- **AES-256-GCM** — symmetric encryption. Grover's algorithm provides only
  quadratic speedup, reducing effective security to 128 bits. Still secure.
- **SHA-256 / PBKDF2-HMAC-SHA-256** — hash functions. Same reasoning. The
  three-tier KDF and password hashing are quantum-resistant.
- **PoW (pow5-64b)** — the Google paper explicitly states quantum attacks on
  proof-of-work are infeasible.

### What needs replacing

Two primitives:

1. **Signatures**: P-256 ECDSA → post-quantum signature scheme
2. **Key exchange**: P-256 ECDH → post-quantum key encapsulation mechanism (KEM)

### NIST post-quantum standards (as of 2024)

NIST has standardized three post-quantum algorithms:

- **ML-KEM** (FIPS 203, formerly CRYSTALS-Kyber) — key encapsulation mechanism
  (replaces ECDH). Lattice-based (Module-LWE).
- **ML-DSA** (FIPS 204, formerly CRYSTALS-Dilithium) — digital signatures
  (replaces ECDSA). Lattice-based (Module-LWE/SIS).
- **SLH-DSA** (FIPS 205, formerly SPHINCS+) — digital signatures. Hash-based (no
  lattice assumptions, most conservative).

Additional standard expected:

- **FN-DSA** (formerly Falcon) — digital signatures. Lattice-based (NTRU).
  Smaller signatures than ML-DSA but harder to implement safely (discrete
  Gaussian sampling).

### Size comparison

| Primitive  | Current (P-256) | ML-DSA-65   | SLH-DSA-128s | FN-DSA-512 | ML-KEM-768  |
| ---------- | --------------- | ----------- | ------------ | ---------- | ----------- |
| Public key | 33 bytes        | 1,952 bytes | 32 bytes     | 897 bytes  | 1,184 bytes |
| Signature  | 64 bytes        | 3,293 bytes | 7,856 bytes  | 666 bytes  | —           |
| Ciphertext | —               | —           | —            | —          | 1,088 bytes |

The size explosion is the primary engineering challenge. It affects:

- Database storage (public keys, encrypted private keys)
- Federation API responses
- Auth callback URLs (signature in query params)
- Message sizes
- Address book / key discovery bandwidth

### Prior art

- **Signal**: deployed PQXDH (hybrid X25519 + ML-KEM) for key exchange in
  September 2023. Signatures still use Ed25519 (quantum-vulnerable).
- **Algorand**: uses Falcon signatures on-chain.
- **QRL, Mochimo, Abelian**: post-quantum from inception (XMSS hash-based
  signatures).
- **Google paper recommendation**: composite signatures (ECDSA + PQC scheme)
  during transition for defense-in-depth.

### Hybrid approach

The recommended migration strategy is hybrid: use both classical and
post-quantum algorithms simultaneously. A signature is valid only if both the
P-256 ECDSA and the PQC signature verify. A key exchange produces a shared
secret only if both the ECDH and the ML-KEM succeed.

Benefits:

- If the PQC scheme is broken classically (it's newer, less tested), the
  classical scheme still protects.
- If a quantum computer arrives, the PQC scheme protects.
- Backwards compatibility during the transition.

### Key questions to answer

1. **Which signature algorithm?** ML-DSA (largest, most conservative lattice),
   FN-DSA (smallest, implementation risk), or SLH-DSA (hash-based, no lattice
   assumptions, largest signatures)?
2. **Which KEM?** ML-KEM is the only standardized option — this is likely the
   answer, but confirm parameter set (ML-KEM-512, 768, or 1024).
3. **Hybrid or pure PQC?** The Google paper recommends composite signatures.
   Signal uses hybrid key exchange. Should KeyPears do hybrid for both?
4. **Web Crypto API support?** Do any browsers support ML-KEM, ML-DSA, or
   SLH-DSA natively? If not, we need a WASM or JS library. This is a critical
   constraint — KeyPears does all crypto in the browser.
5. **Library availability?** What mature, audited JS/WASM libraries exist for
   the NIST PQC standards?
6. **Migration path?** How do we transition existing users? Key rotation is
   already supported — users can add new keys. But old messages encrypted with
   ECDH shared secrets remain vulnerable to harvest-now-decrypt-later attacks.
7. **Auth protocol impact?** The `/sign` page puts signatures in URL query
   params. A 3KB+ signature in a URL may exceed browser limits (~2KB for IE,
   ~8KB for modern browsers). May need to switch to POST-based callback.

## Plan

1. Research available PQC libraries for browser/JS environments and determine
   which algorithms are practically usable today.
2. Design the hybrid cryptographic scheme for KeyPears.
3. Implement and migrate.

## Experiment 1: Survey PQC implementations

### Goal

Identify all available implementations of NIST post-quantum algorithms in Rust,
JavaScript/TypeScript, and other languages. Determine what is practically usable
for KeyPears today, given that all crypto runs in the browser.

### Algorithms surveyed

Four NIST PQC algorithms relevant to KeyPears:

- **ML-KEM** (FIPS 203) — key encapsulation, replaces ECDH
- **ML-DSA** (FIPS 204) — signatures, replaces ECDSA
- **SLH-DSA** (FIPS 205) — hash-based signatures (most conservative)
- **FN-DSA** (draft, formerly Falcon) — signatures (smallest, implementation
  risk)

### Findings: Rust implementations

| Algorithm | Crate                           | Downloads | Notes                                   |
| --------- | ------------------------------- | --------- | --------------------------------------- |
| ML-KEM    | `ml-kem` (RustCrypto)           | 1.1M      | Pure Rust, recommended. Not audited.    |
| ML-KEM    | `pqcrypto-kyber` (rustpq)       | 1.4M      | Wraps PQClean C code via FFI.           |
| ML-DSA    | `ml-dsa` (RustCrypto)           | 426K      | Pure Rust, early versions. Not audited. |
| ML-DSA    | `pqcrypto-dilithium` (rustpq)   | 201K      | PQClean wrapper.                        |
| SLH-DSA   | `slh-dsa` (RustCrypto)          | 235K      | Pure Rust, all 12 parameter sets.       |
| SLH-DSA   | `pqcrypto-sphincsplus` (rustpq) | 353K      | PQClean wrapper.                        |
| FN-DSA    | `fn-dsa` (Thomas Pornin)        | 18K       | By the Falcon designer. Authoritative.  |
| FN-DSA    | `pqcrypto-falcon` (rustpq)      | 84K       | PQClean wrapper.                        |
| All       | `oqs` (liboqs-rust)             | 119K      | FFI bindings to liboqs C library.       |

The RustCrypto crates (`ml-kem`, `ml-dsa`, `slh-dsa`) are pure Rust and compile
to WASM. The `pqcrypto` crates wrap C code via FFI and would need more work for
WASM compilation.

### Findings: JavaScript/TypeScript implementations

| Algorithm | Package               | Monthly downloads | Notes                                                                                                                                                           |
| --------- | --------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All four  | `@noble/post-quantum` | 300K/month        | Pure TS, zero deps. ML-KEM, ML-DSA, SLH-DSA, Falcon. By paulmillr (author of `@noble/curves`). Self-audited, no independent audit. No constant-time guarantees. |
| ML-KEM    | `mlkem`               | 27K/month         | Pure TS.                                                                                                                                                        |
| ML-DSA    | `dilithium-crystals`  | 15K/month         | WASM build.                                                                                                                                                     |
| SLH-DSA   | `sphincs`             | 14K/month         | WASM build.                                                                                                                                                     |
| All       | `@stenvault/pqc-wasm` | 836/month         | RustCrypto ML-KEM + ML-DSA compiled to WASM.                                                                                                                    |
| All       | `@oqs/liboqs-js`      | 906/month         | liboqs compiled to WASM.                                                                                                                                        |
| All       | `fips-crypto`         | 205/month         | Rust/WASM FIPS 203, 204, 205.                                                                                                                                   |

`@noble/post-quantum` is the clear leader for JS/TS: 300K monthly downloads,
pure TypeScript, covers all four algorithms, by the same author as the widely
trusted `@noble/curves` and `@noble/hashes` libraries (which ARE independently
audited). It works in all JS runtimes including browsers.

### Findings: Other languages

| Language | Implementation                   | Notes                                                       |
| -------- | -------------------------------- | ----------------------------------------------------------- |
| Go       | stdlib `crypto/mlkem` (Go 1.24+) | ML-KEM in the standard library. Production-ready.           |
| Go       | Cloudflare CIRCL (1,653 stars)   | ML-KEM, ML-DSA, SLH-DSA. Production-grade.                  |
| C        | liboqs (2,888 stars)             | All algorithms. The most comprehensive PQC library.         |
| C        | PQClean (907 stars)              | Clean reference implementations. Basis for Rust `pqcrypto`. |
| C        | AWS-LC (757 stars)               | AWS BoringSSL fork. FIPS-validated ML-KEM.                  |

### Web Crypto API support

**No browser supports PQC in Web Crypto.** Chrome ships ML-KEM-768 hybrid key
exchange at the TLS layer (for HTTPS), but this is not exposed to JavaScript.
All browser-side PQC must use JS libraries or WASM.

### Audit status

No pure PQC implementation has completed an independent third-party audit yet.
The closest to production-ready:

- **Go stdlib `crypto/mlkem`** — maintained by Go security team
- **AWS-LC** — FIPS-validated, includes ML-KEM
- **`@noble/post-quantum`** — self-audited, highest adoption in JS ecosystem, by
  an author whose other libraries are independently audited

### Analysis for KeyPears

**Two viable paths for browser-side PQC:**

1. **`@noble/post-quantum`** — pure TypeScript, zero build complexity, covers
   all four algorithms. Same ecosystem as `@noble/curves` which KeyPears could
   also use for P-256 (currently uses `@webbuf/p256`). The lack of constant-time
   guarantees is a concern for signing (private key operations) but acceptable
   for verification (public key operations).

2. **RustCrypto crates compiled to WASM** — `ml-kem`, `ml-dsa`, `slh-dsa` are
   pure Rust, compile to WASM cleanly. More likely to have constant-time
   properties. Adds WASM build complexity. The `@stenvault/pqc-wasm` and
   `fips-crypto` npm packages already do this, though they have low adoption.

**Recommendation**: start with `@noble/post-quantum` for speed of integration.
It's pure TypeScript, works everywhere, covers all algorithms, and the author
has a strong track record. If constant-time signing becomes a concern, we can
swap the signing side to a Rust/WASM implementation later — the verification
side (which is what third-party apps do via `@keypears/client`) doesn't need
constant-time guarantees.

**Algorithm recommendation based on the survey:**

- **Key exchange**: ML-KEM-768 (the only standardized KEM, middle security
  level, what Signal and Chrome use)
- **Signatures**: ML-DSA-65 (standardized, most conservative lattice scheme) or
  SLH-DSA-128s (hash-based, no lattice assumptions, but 8KB signatures). FN-DSA
  has the smallest signatures (666 bytes) but is not yet a final FIPS standard
  and has implementation risk.

### Result: Pass

The ecosystem is ready. `@noble/post-quantum` provides all four NIST PQC
algorithms in pure TypeScript with 300K monthly downloads. RustCrypto provides
pure Rust implementations that compile to WASM. No independent audits exist for
any PQC library yet, but adoption is growing rapidly. Next experiment should
design the specific hybrid scheme for KeyPears.
