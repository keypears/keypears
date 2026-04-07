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

## Experiments

### Experiment 1: Replace raw user ID cookies with hashed session tokens

#### Description

The session cookie currently stores a raw UUIDv7 user ID. Replace it with a
cryptographically random 32-byte token. The server stores only the BLAKE3 hash
of the token in a new `sessions` table. The raw token lives only in the cookie.

**Token lifecycle:**

- On login or account creation, generate 32 random bytes as hex (the token).
- BLAKE3 hash the token (single hash, no KDF — the token is already
  high-entropy, brute-force strengthening is pointless).
- Store `(tokenHash, userId, expiresAt, createdAt)` in the `sessions` table.
- Set the raw token as the cookie value.
- On every request: read cookie, hash it, look up the hash in `sessions`.
  If found and not expired, the user is authenticated. Otherwise, reject.
- On logout: delete the session row by hash, clear the cookie.
- On password change or key rotation: delete all session rows for the user
  except the current one (revoke all other sessions).

**Expiration policy:**

- Unsaved accounts: 1 day (same as now).
- Saved accounts: 30 days (reduced from 2 years).
- Lazy cleanup of expired rows on read (same pattern as `used_pow`).

#### Changes

**`webapp/src/db/schema.ts`** — Add `sessions` table:

```ts
export const sessions = mysqlTable("sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: binaryId("user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**`webapp/src/server/user.server.ts`** — Add session functions:

- `createSession(userId, maxAge)` — generate random token, hash with BLAKE3,
  insert into `sessions`, return raw token.
- `resolveSession(token)` — hash token, look up in `sessions`, check expiry,
  lazy-delete expired rows, return `userId` or `null`.
- `deleteSession(token)` — hash token, delete from `sessions`.
- `deleteAllSessionsExcept(userId, currentTokenHash)` — revoke all other
  sessions for a user.
- `deleteAllSessions(userId)` — revoke all sessions (for account deletion).

**`webapp/src/server/user.functions.ts`** — Update all cookie operations:

- `createUser` — call `createSession(userId, ONE_DAY)`, set cookie to raw token.
- `getMyUser` / `getOrCreateUser` — replace `getUserById(getCookie())` with
  `resolveSession(getCookie())` to get the user ID.
- `saveMyUser` — after saving, create a new session with 30-day expiry
  (replacing the 1-day unsaved session).
- `login` — call `createSession(userId, THIRTY_DAYS)`, set cookie to raw token.
- `logout` — call `deleteSession(token)`, clear cookie.
- `deleteMyUser` — call `deleteAllSessions(userId)`, clear cookie.
- `changeMyPassword` — call `deleteAllSessionsExcept(userId, currentHash)` to
  revoke other sessions.

**`webapp/src/server/message.functions.ts`** — Update all `getCookie` call
sites to use `resolveSession` instead of treating the cookie value as a user ID.

Extract a shared helper (e.g. `getAuthenticatedUserId()`) that reads the
cookie, resolves the session, and throws "Not logged in" if invalid — replacing
the repeated pattern across both files.

**`webapp/src/server/pow.functions.ts`** — No changes (PoW doesn't touch
sessions).

#### Verification

1. Create an account — cookie value is a 64-char hex string (not a UUID).
2. `sessions` table has a row with a different hash, correct user ID, and
   expiry 1 day from now.
3. Set password — session is replaced with a 30-day expiry.
4. Log out — session row is deleted, cookie is cleared.
5. Log in — new session row created with 30-day expiry.
6. Copy the cookie value, change password — old cookie no longer works
   (session revoked).
7. Directly querying the `sessions` table reveals only hashes, never raw
   tokens.
8. All existing functionality works: sending messages, key rotation, channel
   polling, federation.
