+++
status = "closed"
opened = "2026-04-07"
closed = "2026-04-07"
+++

# Issue 4: Email Sending — Nodemailer vs Lettre

## Goal

Choose and implement an email sending solution for KeyPears. The immediate need
is sending OTP emails for domain verification (multi-domain auth). The solution
must be self-contained — no cloud vendor lock-in — and forward-compatible with
full email hosting.

Compare Nodemailer (TypeScript) and lettre (Rust) as the two leading options.

## Background

Issue 0001 surveyed the email landscape. Issue 0003 added multi-domain support.
The next step is email-based auth: a domain owner proves ownership of their
email address by receiving an OTP. This requires the KeyPears server to send
email.

### Design criteria

1. **No vendor lock-in.** Node operators must not be forced into AWS, SendGrid,
   or any specific provider. The default path should work on any server with
   outbound SMTP access.
2. **Self-contained.** The email capability ships with KeyPears. No mandatory
   sidecar processes or external services.
3. **Forward-compatible.** The solution should scale toward full email hosting
   (send + receive + DKIM + SPF + DMARC) without a rewrite.
4. **Fits our stack.** The project already uses TypeScript (Bun) and Rust
   (webbuf libraries compiled to WASM). Both languages are first-class.

### Candidates

**Nodemailer (TypeScript)**

- Most popular Node.js email library (5M+ weekly downloads).
- Pure JavaScript, runs in Bun.
- Supports direct SMTP sending (no relay) and any SMTP relay.
- Built-in DKIM signing support.
- Same author wrote `smtp-server` for receiving email.
- Battle-tested in production at massive scale.
- Would live directly in our TypeScript codebase — import and call.

**lettre (Rust)**

- Mature Rust SMTP client (v0.11, actively maintained).
- Async (tokio), connection pooling, TLS, STARTTLS.
- Could be compiled to a standalone binary, called via subprocess or HTTP.
- Could potentially compile to WASM and call from Bun (like webbuf).
- Rust's type system and performance may matter for high-volume email.
- Forward path: Stalwart (full Rust mail server) shares the Rust ecosystem.
- Could be the foundation for a custom mail binary that grows over time.

### Questions to answer

1. **Direct sending vs relay.** Can either library send email directly to
   recipient MX servers (no relay) with acceptable deliverability? Or do we
   realistically need a relay for IP reputation reasons?

2. **DKIM signing.** Does each library support DKIM out of the box? How hard is
   it to configure?

3. **Bun compatibility.** Does Nodemailer work in Bun without issues? (Some
   Node.js libraries have compatibility gaps in Bun.) Does lettre compile to
   WASM that Bun can call, or is a separate binary more practical?

4. **Receiving email.** If we later need to receive email, what does each
   ecosystem offer? Nodemailer has `smtp-server`. lettre has no receiving
   component, but Stalwart covers that in Rust.

5. **Performance.** For OTP emails, performance is irrelevant. For full email
   hosting at scale, does Rust's performance advantage matter?

6. **Operational complexity.** A TypeScript library in-process is simpler than a
   Rust binary sidecar. Is the complexity worth it?

7. **WASM option.** Could lettre compile to WASM and run inside Bun, like webbuf
   does? This would give Rust performance without a sidecar. What are the
   limitations (networking from WASM, TLS, async)?

## Experiments

### Experiment 1: Deep dive into both codebases

#### Description

Read the source code of both Nodemailer and lettre to answer the seven
questions above and determine which is the better fit for KeyPears.

Both repos cloned into `vendor/` for analysis.

#### Results

##### Nodemailer

- **Size**: 13.4K lines across 34 modules. Pure JavaScript, zero runtime
  dependencies — only Node.js built-ins.
- **Architecture**: Modular — separate SMTP transport, connection pool, DKIM
  signer, MIME builder, and mail composer. Multiple transports (SMTP, SMTP
  pool, sendmail, SES, stream, JSON).
- **DKIM**: Built-in, RSA-SHA256, relaxed/relaxed canonicalization, RFC 6376
  compliant. Configured per-transport or per-message.
- **TLS**: Full support — SMTPS (port 465), STARTTLS (port 587), opportunistic
  TLS, RFC 8689 REQUIRETLS.
- **Connection pooling**: Built-in with configurable max connections, messages
  per connection, and rate limiting.
- **Direct MX sending**: Stubbed (`direct://` protocol parsed) but NOT
  implemented. The MX resolution code does not exist.
- **License**: MIT-0 (MIT No Attribution).
- **Module system**: CommonJS (`require`/`module.exports`). No TypeScript
  source — types are in a separate package.
- **Bun compatibility**: Uses `net`, `tls`, `dns`, `crypto`, and
  `child_process` — all Node.js built-ins that may have compatibility gaps in
  Bun. Socket and TLS APIs are the highest risk.
- **Receiving**: Not included. The `smtp-server` package is separate (same
  author).
- **Maintenance**: Active, v8.0.4 (March 2026). Recent security fixes.

##### lettre

- **Size**: 15.7K lines of Rust in a single crate with feature flags.
- **Architecture**: Builder pattern for messages, trait-based transports.
  Transports: SMTP, sendmail, file (debug), stub (testing). Strong type safety
  with compile-time checks.
- **DKIM**: Built-in (feature-gated), supports both RSA and ED25519. Proper
  canonicalization and header signing.
- **TLS**: Three backends — native-tls (OS native), rustls (pure Rust),
  boring-tls (BoringSSL). Supports SMTPS, STARTTLS, opportunistic, and
  plaintext.
- **Connection pooling**: Built-in (feature-gated), configurable idle timeout,
  min/max connections. Works in sync and async modes.
- **Direct MX sending**: NOT supported. Documentation explicitly states it is
  relay-only. No MX resolution.
- **License**: MIT.
- **Async**: Supports tokio and async-std via feature flags.
- **WASM**: NOT viable. A `web` feature exists for time handling only.
  Networking (`TcpStream`) is fundamentally incompatible with WASM. Message
  building would compile, but the SMTP transport cannot.
- **Binary option**: Straightforward — ~500 lines to wrap lettre in an HTTP
  server (axum/actix) that accepts JSON and sends via SMTP. This is the
  practical integration path.
- **Receiving**: Not provided. The Rust ecosystem has `mail-parser` for parsing
  and Stalwart for full server functionality, but nothing from lettre itself.
- **Maintenance**: Active, v0.11.21 (April 2026). Strict lints, `forbid(unsafe)`.

##### Comparison

| Aspect                | Nodemailer            | lettre                  |
|-----------------------|-----------------------|-------------------------|
| Language              | JavaScript (CJS)      | Rust                    |
| Lines of code         | 13.4K                 | 15.7K                   |
| Dependencies          | Zero (pure JS)        | ~30 (lean for Rust)     |
| DKIM                  | RSA only              | RSA + ED25519           |
| TLS backends          | Node.js built-in      | 3 options (incl. rustls)|
| Connection pooling    | Yes                   | Yes                     |
| Direct MX sending     | Stubbed, not working  | Explicitly unsupported  |
| WASM                  | N/A                   | Not viable (networking) |
| Bun compatibility     | Risky (net/tls/dns)   | N/A (separate binary)   |
| Integration model     | In-process import     | Sidecar binary or FFI   |
| Receiving ecosystem   | smtp-server (JS)      | Stalwart (Rust)         |
| License               | MIT-0                 | MIT                     |
| Type safety           | Runtime only          | Compile-time            |

##### Answering the seven questions

**1. Direct sending vs relay.** Neither library supports direct MX sending.
Both require a relay. For self-hosted KeyPears, this means either running a
local MTA (like Postfix or Stalwart) as the relay, or connecting to an external
SMTP service. For OTP emails, a configured relay is fine. For full email
hosting, a local MTA is needed regardless.

**2. DKIM signing.** Both have built-in DKIM. lettre additionally supports
ED25519 (newer, recommended by RFC 8463). Both are adequate.

**3. Bun compatibility.** Nodemailer uses Node.js `net`, `tls`, `dns`, and
`crypto` modules directly. Bun's compatibility with these varies — socket and
TLS APIs are the biggest risk. We'd likely hit issues that need patching or
polyfills. lettre doesn't run in Bun at all — it's a separate binary.

**4. Receiving email.** Nodemailer's ecosystem includes `smtp-server` (same
author, JS). lettre has nothing for receiving, but Stalwart (Rust) is a
complete mail server. If we go Rust for sending, Stalwart is the natural
receiving complement — and it's far more capable than `smtp-server`.

**5. Performance.** Irrelevant for OTP emails. For full email hosting, Rust
would be faster, but email is I/O-bound (network, DNS), not CPU-bound. The
difference is unlikely to matter in practice.

**6. Operational complexity.** Nodemailer in-process is simpler IF it works
in Bun. A Rust sidecar binary adds deployment complexity (two processes,
inter-process communication). However, a Rust binary is self-contained and
doesn't depend on Bun's Node.js compatibility layer working correctly.

**7. WASM option.** Not viable for lettre. WASM cannot do TCP networking. Only
message building would compile, which isn't useful — we need the transport.

#### Conclusion

Neither library is a clear winner. The choice depends on which tradeoff we
prefer:

**Nodemailer** is simpler to integrate (import and call) but has Bun
compatibility risk. If Bun's `net`/`tls`/`dns` APIs work with Nodemailer, it's
the faster path. If they don't, we'd spend time debugging compatibility issues
in a CJS codebase we don't control.

**lettre** is more robust (type safety, multiple TLS backends, ED25519 DKIM)
but requires a sidecar binary and IPC. The Rust ecosystem (lettre + Stalwart)
offers a stronger forward path toward full email hosting. A sidecar is more
operationally complex but more predictable — no Bun compatibility questions.

The next experiment should test Nodemailer in Bun to determine if the
compatibility risk is real or theoretical. If it works, Nodemailer is the
pragmatic choice for now. If it doesn't, lettre sidecar is the path forward.

## Conclusion

Email sending is not needed. The original motivation was OTP verification for
domain owners adding custom domains to KeyPears. But domain ownership can be
proven without email — the domain owner places a `keypears.json` file at
`/.well-known/keypears.json` containing an `admin` field that names an existing
KeyPears user (e.g. `ryan@keypears.com`). KeyPears fetches this over HTTPS,
verifying domain ownership via TLS — the same trust model already used for
federation.

This eliminates the need for SMTP, relays, MX resolution, IP reputation
management, and all the operational complexity of email sending. Domain
claiming becomes a simple HTTPS fetch of a JSON file.

Neither Nodemailer nor lettre is needed. The vendored repos can be removed.

Email hosting remains a possible future feature but is not required for
multi-domain support. If pursued later, it would be its own issue with
different requirements (full email service, not just OTP).
