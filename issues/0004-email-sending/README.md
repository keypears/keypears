+++
status = "open"
opened = "2026-04-07"
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
