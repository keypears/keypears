+++
status = "open"
opened = "2026-04-07"
+++

# Issue 2: Security Audit

## Goal

Audit and fix all security gaps in KeyPears: session cookies, password hashing,
message authentication, and sender verification. Every message received must be
cryptographically verified as coming from the claimed sender.

## Background

KeyPears is an end-to-end encrypted messaging system using secp256k1 key pairs,
ECDH shared secrets, and ACS2 encryption. A security audit revealed several
issues ranging from critical (no sender public key verification) to moderate
(raw user ID as session cookie).

### Audit findings

#### 1. Session cookies

The session cookie stores a **raw UUIDv7 user ID** as its value. Cookie flags
are reasonable (`httpOnly`, `sameSite: "lax"`, `secure` in production), and
expiration is 1 day for unsaved accounts, 2 years for saved ones. However:

- UUIDv7 is sequential — if the ID format is known, cookies are guessable.
- No session token layer exists. A leaked user ID = full impersonation.
- No session revocation mechanism (can't invalidate sessions without changing
  the user's database ID).
- No session rotation on sensitive actions (password change, key rotation).

#### 2. Password hashing / KDF — GOOD

The three-tier BLAKE3-based KDF is sound:

```
Password (never stored)
  -> [100k blake3Pbkdf rounds, password-derived salt]
  -> Password Key (ephemeral, discarded)
    -> [100k rounds, "encryption salt v1"] -> Encryption Key (localStorage, NEVER sent to server)
    -> [100k rounds, "login salt v1"]      -> Login Key (sent to server once, discarded)
      -> [100k rounds server-side, "server login salt v1"] -> Stored hash
```

- Encryption key and login key are siblings — neither derivable from the other.
- Server hashes login key with 100k additional rounds before storing.
- Timing-safe comparison on verification.
- Total rounds to crack: 400k BLAKE3 iterations per guess.

No issues found. This is well-designed.

#### 3. Sender public key verification — CRITICAL

The `sendMessage` handler accepts `senderPubKey` and `recipientPubKey` directly
from the client without verifying they match the actual keys in the database.
The server already has this data (via `getActiveKey`) but doesn't check it.

For local delivery: a logged-in user could send messages with a bogus public
key. The `senderAddress` is correctly forced from the session, but the public
key is not verified.

For remote delivery (federation): the pulled message's `senderPubKey` is stored
without any verification that it belongs to the claimed `senderAddress`.

#### 4. Message signatures — MISSING

Messages are encrypted but not signed. ECDH encryption proves the sender knows
their private key (since the shared secret requires it), but there's no explicit
signature that the recipient can verify. The recipient trusts that the server
stored the correct `senderPubKey`, but the server doesn't verify it (see #3).

#### 5. Federation content integrity — WEAK

When pulling a message from a remote server, the recipient verifies
`senderAddress` and `recipientAddress` match the notification, but does not
verify `senderPubKey`, `recipientPubKey`, or `encryptedContent`. A compromised
sender server could modify these fields.

#### 6. Other observations

- No CSRF token — relies solely on `sameSite: "lax"`.
- No rate limiting on failed logins beyond PoW (LOGIN_DIFFICULTY = 7M, ~1s on
  GPU).
- No forward secrecy — static ECDH keys mean a compromised private key exposes
  all past messages encrypted with that key pair.
