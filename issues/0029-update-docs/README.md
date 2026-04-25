+++
status = "open"
opened = "2026-04-25"
+++

# Update documentation for post-quantum migration

## Goal

Update CLAUDE.md, protocol docs, and blog posts to reflect the post-quantum
migration (issue 0027). The whitepaper is already updated (issue 0028). The
code is fully migrated. The documentation is the last place P-256 references
remain.

## Files with stale P-256 references

### CLAUDE.md (must update)

- Tech stack section references P-256, ECDSA, ECDH, `@webbuf/p256`
- Auth architecture section references P-256 key pairs
- Key management section references P-256
- Database schema section references old column names (`publicKey`,
  `encryptedPrivateKey`)
- Various other sections reference classical crypto

### Protocol docs (must update)

- `webapp/src/docs/protocol/key-derivation.md` — references P-256
- `webapp/src/docs/protocol/encryption.md` — describes ECDH, P-256
- `webapp/src/docs/protocol/addressing.md` — references P-256 key pairs
- `webapp/src/docs/protocol/proof-of-work.md` — references P-256 ECDSA signing
- `webapp/src/docs/security.md` — references P-256 throughout
- `webapp/src/docs/federation.md` — may reference P-256
- `webapp/src/docs/welcome.md` — may reference P-256

### Blog posts (historical — do not rewrite)

Blog posts are historical records. They describe what was true when they were
published. Do NOT rewrite old blog posts to say ML-DSA/ML-KEM — that would be
historically false. Instead, add a note at the top of affected posts:

> **Note (April 2026):** KeyPears has since migrated to post-quantum
> cryptography. The P-256 cryptography described in this post has been replaced
> with ML-DSA-65 and ML-KEM-768. See the current whitepaper for details.

Affected blog posts:
- `2025-12-13-server-generated-public-keys.md`
- `2025-12-20-dh-messaging-poc.md`
- `2025-12-21-sender-verification.md`
- `2026-04-12-announcing-keypears-alpha.md`
- `2026-04-12-back-to-nist.md`
- `2026-04-20-sign-in-with-your-address.md`

## Plan

1. Update all documentation to reflect the current post-quantum system.
