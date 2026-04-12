
KeyPears uses a three-tier key derivation system to separate authentication from
encryption. The user's password is never stored anywhere. An **encryption key**
is derived from the password and cached on the client, enabling all crypto
operations without re-entering the password.

## The three tiers

```
Password (entered once, never stored)
  │
  │ PBKDF2-HMAC-SHA-256, 300k rounds
  ▼
Password Key (ephemeral — derived, used, then discarded)
  │
  ├──▶ PBKDF2-HMAC-SHA-256, 300k rounds, salt A ──▶ Encryption Key (cached on client)
  │
  └──▶ PBKDF2-HMAC-SHA-256, 300k rounds, salt B ──▶ Login Key (sent to server, discarded)
                                                          │
                                                          │ PBKDF2-HMAC-SHA-256, 100k rounds,
                                                          │ per-user server salt
                                                          ▼
                                                      Stored Hash (server-side)
```

### Tier 1: Password → Password Key

The password is combined with a deterministic salt (derived from the password
itself via HMAC-SHA-256) and run through 300,000 rounds of PBKDF2-HMAC-SHA-256
(RFC 8018). The result is the **password key** — a 256-bit intermediate secret.

The password key is **ephemeral**. It exists only long enough to derive the
encryption key and login key, then it is discarded. It is never stored.

### Tier 2a: Password Key → Encryption Key

The encryption key is derived from the password key with a different salt and
another 300,000 rounds of PBKDF2-HMAC-SHA-256. It is used to encrypt and
decrypt private keys (P-256) using AES-256-GCM.

The encryption key **never leaves the client**. It is not sent to the server.
It is cached on the client after the user enters their password (on account
save or login). This allows subsequent crypto operations (key rotation, message
decryption) without re-prompting for the password.

### Tier 2b: Password Key → Login Key

The login key is derived from the password key with yet another salt and
300,000 rounds of PBKDF2-HMAC-SHA-256. It is sent to the server for
authentication.

The login key is **ephemeral on the client**. After a successful login, the
server issues a session token — the login key is discarded and never stored on
the client.

The server hashes the login key with an additional 100,000 rounds of
PBKDF2-HMAC-SHA-256 using a **per-user salt** (derived deterministically from
the user's ID) before storing it in the database.

An attacker who steals the database cannot brute-force the login key directly
— it is a uniformly random 256-bit value with a search space of 2^256. The
only realistic attack is a dictionary attack against the user's password: for
each candidate password, the attacker computes the full chain (password →
password key → login key → stored hash), requiring 700,000 rounds of
PBKDF2-HMAC-SHA-256 per guess (300,000 for Tier 1, 300,000 for Tier 2b, and
100,000 for the server tier). The per-user salt prevents parallelising a
dictionary attack across multiple users — each user's hash must be cracked
independently.

## Security properties

**NIST-compliant.** All primitives are NIST-approved: SHA-256 (FIPS 180-4),
HMAC-SHA-256 (FIPS 198-1), PBKDF2 (SP 800-132), AES-256-GCM (SP 800-38D), and
P-256 (FIPS 186-5). The 700,000 total rounds exceed the SP 800-132
recommendation of 600,000.

**Separation of concerns.** Knowing the encryption key does not reveal the
login key, and vice versa. They are derived from the same password key but
with different salts, making them cryptographically independent.

**No raw password storage.** The password is used once to derive the password
key, then discarded. The password key is used to derive the encryption key and
login key, then discarded. Only the encryption key is cached.

**If client storage is compromised:** The attacker gets the encryption key and
can decrypt private keys on that device. But they CANNOT derive the login key
(it's a sibling, not a child) and cannot impersonate the user on the server.
They also cannot recover the user's password.

**Graceful fallback.** If client storage is cleared, the user simply re-enters
their password. No data is lost — the same password derives the same keys.

**Login key never stored raw.** The server hashes the login key with 100,000
additional PBKDF2-HMAC-SHA-256 rounds, using a per-user salt, before storing.
A database breach reveals only hashes, not login keys, and an attacker cannot
crack them all in parallel.

## Per-key password tracking

Each encrypted private key in the database stores a `loginKeyHash` — the
server-hashed login key for the password that encrypted it. This allows the
system to determine which keys are decryptable with the current password
without attempting decryption.

When a key's `loginKeyHash` matches the user's current password hash, the key
is "active" — the cached encryption key can decrypt it. When they differ, the
key is "locked" — the user must enter the old password to re-encrypt it.

## Password change

When changing passwords, only keys encrypted with the current password are
re-encrypted:

1. Derive old encryption key from old password (or use cached).
2. Fetch all encrypted private keys from server.
3. Decrypt each with old encryption key — skip failures (locked keys).
4. Derive new password key, encryption key, and login key from new password.
5. Re-encrypt decryptable private keys with new encryption key.
6. Update server: new hashed login key + re-encrypted keys.
7. Cache new encryption key on client.
8. Locked keys remain unchanged under their old password.

## Key rotation

When rotating keys, a new P-256 key pair is generated. The private key is
encrypted with the cached encryption key and stored in the `user_keys` table
alongside the public key. The most recent key is the active key. The new key's
`loginKeyHash` is set to match the user's current password hash.

If the cached encryption key is missing (cleared client storage, new device),
the user is prompted for their password. The password key is derived, the
encryption key is derived from it and cached, then the password key is
discarded.

## Algorithms

| Purpose          | Algorithm                    | Library                   |
| ---------------- | ---------------------------- | ------------------------- |
| Hash             | SHA-256                      | `@webbuf/sha256`          |
| MAC              | HMAC-SHA-256                 | `@webbuf/sha256`          |
| KDF              | PBKDF2-HMAC-SHA-256 (RFC 8018) | `@webbuf/pbkdf2-sha256` |
| Encryption       | AES-256-GCM (AEAD)           | `@webbuf/aesgcm`          |
| Key pairs        | P-256 (NIST, FIPS 186-5)     | `@webbuf/p256`            |
| Rounds per tier  | 300,000 client-side, 100,000 server-side | |

## Implementation

All key derivation functions are in `webapp/src/lib/auth.ts`:

- `derivePasswordKey(password)` — Tier 1 (ephemeral)
- `deriveEncryptionKeyFromPasswordKey(passwordKey)` — Tier 2a
- `deriveLoginKeyFromPasswordKey(passwordKey)` — Tier 2b (ephemeral)
- `cacheEncryptionKey(encryptionKey)` — stores encryption key on client
- `getCachedEncryptionKey()` — retrieves cached encryption key
- `clearCachedEncryptionKey()` — clears on logout

Server-side hashing is in `webapp/src/server/user.server.ts`:

- `hashLoginKey(loginKeyHex, userId)` — 100k rounds of PBKDF2-HMAC-SHA-256
  with a per-user salt derived from the user's ID
