# Key Derivation

KeyPears uses a three-tier key derivation system to separate authentication
from encryption. The user's password is never stored anywhere. An **encryption
key** is derived from the password and cached in localStorage, enabling all
crypto operations without re-entering the password.

## The Three Tiers

```
Password (entered once, never stored)
  |
  | BLAKE3 PBKDF, 100k rounds
  v
Password Key (ephemeral — used to derive the two keys below, then discarded)
  |
  +---> BLAKE3 PBKDF, 100k rounds ---> Encryption Key (cached in localStorage)
  |
  +---> BLAKE3 PBKDF, 100k rounds ---> Login Key (sent to server, then discarded)
```

### Tier 1: Password -> Password Key

The password is combined with a deterministic salt (derived from the password
itself via BLAKE3 keyed MAC) and run through 100,000 rounds of BLAKE3 PBKDF.
The result is the **password key** — a 256-bit intermediate secret.

The password key is **ephemeral**. It exists only long enough to derive the
encryption key and login key, then it is discarded. It is never stored in
localStorage or anywhere else.

### Tier 2a: Password Key -> Encryption Key

The encryption key is derived from the password key with a different salt and
another 100,000 rounds of PBKDF. It is used to encrypt and decrypt private
keys (secp256k1) using ACB3 (AES-256-CBC + BLAKE3-MAC).

The encryption key **never leaves the client**. It is not sent to the server.
It is cached in localStorage after the user enters their password (on account
save or login). This allows subsequent crypto operations (key rotation, message
decryption) without re-prompting for the password.

### Tier 2b: Password Key -> Login Key

The login key is derived from the password key with yet another salt and
100,000 rounds of PBKDF. It is sent to the server for authentication.

The login key is **ephemeral on the client**. After a successful login, the
server issues a session token — the login key is discarded and never stored
on the client.

The server hashes the login key with an additional 100,000 rounds (using a
server-specific salt) before storing it in the database. This means an attacker
who steals the database must reverse 200,000 total rounds of PBKDF to recover
the login key, or 300,000 rounds to recover the password key.

## Per-Key Password Tracking

Each encrypted private key in `user_keys` stores a `loginKeyHash` — the
server-hashed login key for the password that encrypted it. This allows the
system to determine which keys are decryptable with the current password
without attempting decryption.

When a key's `loginKeyHash` matches the user's current `passwordHash`, the
key is "active" — the cached encryption key can decrypt it. When they differ,
the key is "locked" — the user must enter the old password to re-encrypt it.

This supports:
- Admin-created accounts (admin sets initial password, user changes it later)
- Password resets (new key created, old keys stay under old password)
- Recovery (user remembers old password, re-encrypts locked keys)

## Security Properties

**Separation of concerns.** Knowing the encryption key does not reveal the
login key, and vice versa. They are derived from the same password key but
with different salts, making them cryptographically independent.

**No raw password storage.** The password is used once to derive the password
key, then discarded. The password key is used to derive the encryption key and
login key, then discarded. Only the encryption key is cached.

**If localStorage is compromised:** The attacker gets the encryption key and
can decrypt private keys on that device. But they CANNOT derive the login key
(it's a sibling, not a child) and cannot impersonate the user on the server.
They also cannot recover the user's password.

**Forward secrecy on logout.** The cached encryption key is cleared from
localStorage on logout. A stolen device after logout reveals nothing.

**Graceful fallback.** If localStorage is cleared, the user simply re-enters
their password. No data is lost — the same password derives the same keys.

**Login key never stored raw.** The server hashes the login key with 100k
additional BLAKE3 PBKDF rounds before storing. A database breach reveals only
hashes, not login keys.

## Implementation

All key derivation functions are in `webapp/src/lib/auth.ts`:

- `derivePasswordKey(password)` — Tier 1 (ephemeral)
- `deriveEncryptionKeyFromPasswordKey(passwordKey)` — Tier 2a
- `deriveLoginKeyFromPasswordKey(passwordKey)` — Tier 2b (ephemeral)
- `cacheEncryptionKey(encryptionKey)` — stores in localStorage
- `getCachedEncryptionKey()` — retrieves from localStorage
- `clearCachedEncryptionKey()` — clears on logout

Server-side hashing is in `webapp/src/server/user.server.ts`:

- `hashLoginKey(loginKeyHex)` — 100k rounds BLAKE3 PBKDF with server salt

## Algorithms

- **Hash / KDF**: BLAKE3 (keyed MAC mode, via `@webbuf/blake3`)
- **Encryption**: ACB3 (AES-256-CBC + BLAKE3-MAC, via `@webbuf/acb3`)
- **Key pairs**: secp256k1 (via `@webbuf/secp256k1`)
- **Rounds**: 100,000 per tier on client, 100,000 on server

## Key Rotation

When rotating keys, a new secp256k1 key pair is generated. The private key is
encrypted with the cached encryption key and stored in the `user_keys` table
alongside the public key. The most recent key is the active key. The new key's
`loginKeyHash` is set to match the user's current `passwordHash`.

If the cached encryption key is missing (cleared localStorage, new device),
the user is prompted for their password. The password key is derived, the
encryption key is derived from it and cached, the password key is discarded.

## Password Change

When changing passwords, only keys encrypted with the current password are
re-encrypted:

1. Derive old encryption key from old password (or use cached)
2. Fetch all encrypted private keys from server
3. Attempt to decrypt each with old encryption key — skip failures (locked keys)
4. Derive new password key from new password
5. Derive new encryption key and login key from new password key
6. Re-encrypt decryptable private keys with new encryption key
7. Update server: new hashed login key + re-encrypted keys (with updated loginKeyHash)
8. Cache new encryption key in localStorage
9. Locked keys remain unchanged under their old password
