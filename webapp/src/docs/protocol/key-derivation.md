
KeyPears uses a three-tier key derivation system to separate authentication from
encryption. The user's password is never stored anywhere. An **encryption key**
is derived from the password and cached on the client, enabling all crypto
operations without re-entering the password.

## The three tiers

```
Password (entered once, never stored)
  │
  │ BLAKE3 PBKDF, 100k rounds
  ▼
Password Key (ephemeral — derived, used, then discarded)
  │
  ├──▶ BLAKE3 PBKDF, 100k rounds, salt A ──▶ Encryption Key (cached on client)
  │
  └──▶ BLAKE3 PBKDF, 100k rounds, salt B ──▶ Login Key (sent to server, discarded)
                                                  │
                                                  │ BLAKE3 PBKDF, 100k rounds, server salt
                                                  ▼
                                              Stored Hash (server-side)
```

### Tier 1: Password → Password Key

The password is combined with a deterministic salt (derived from the password
itself via BLAKE3 keyed MAC) and run through 100,000 rounds of BLAKE3 PBKDF.
The result is the **password key** — a 256-bit intermediate secret.

The password key is **ephemeral**. It exists only long enough to derive the
encryption key and login key, then it is discarded. It is never stored.

### Tier 2a: Password Key → Encryption Key

The encryption key is derived from the password key with a different salt and
another 100,000 rounds of PBKDF. It is used to encrypt and decrypt private keys
(secp256k1) using ACB3 (AES-256-CBC + BLAKE3-MAC).

The encryption key **never leaves the client**. It is not sent to the server. It
is cached on the client after the user enters their password (on account save or
login). This allows subsequent crypto operations (key rotation, message
decryption) without re-prompting for the password.

### Tier 2b: Password Key → Login Key

The login key is derived from the password key with yet another salt and 100,000
rounds of PBKDF. It is sent to the server for authentication.

The login key is **ephemeral on the client**. After a successful login, the
server issues a session token — the login key is discarded and never stored on
the client.

The server hashes the login key with an additional 100,000 rounds (using a
server-specific salt) before storing it in the database. This means an attacker
who steals the database must reverse 200,000 total rounds of PBKDF to recover
the login key, or 300,000 rounds to recover the password.

## Security properties

**Separation of concerns.** Knowing the encryption key does not reveal the login
key, and vice versa. They are derived from the same password key but with
different salts, making them cryptographically independent.

**No raw password storage.** The password is used once to derive the password
key, then discarded. The password key is used to derive the encryption key and
login key, then discarded. Only the encryption key is cached.

**If client storage is compromised:** The attacker gets the encryption key and
can decrypt private keys on that device. But they CANNOT derive the login key
(it's a sibling, not a child) and cannot impersonate the user on the server.
They also cannot recover the user's password.

**Graceful fallback.** If client storage is cleared, the user simply re-enters
their password. No data is lost — the same password derives the same keys.

**Login key never stored raw.** The server hashes the login key with 100k
additional BLAKE3 PBKDF rounds before storing. A database breach reveals only
hashes, not login keys.

## Per-key password tracking

Each encrypted private key in the database stores a `loginKeyHash` — the
server-hashed login key for the password that encrypted it. This allows the
system to determine which keys are decryptable with the current password without
attempting decryption.

When a key's `loginKeyHash` matches the user's current password hash, the key is
"active" — the cached encryption key can decrypt it. When they differ, the key
is "locked" — the user must enter the old password to re-encrypt it.

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

When rotating keys, a new secp256k1 key pair is generated. The private key is
encrypted with the cached encryption key and stored in the `user_keys` table
alongside the public key. The most recent key is the active key. The new key's
`loginKeyHash` is set to match the user's current password hash.

If the cached encryption key is missing (cleared client storage, new device),
the user is prompted for their password. The password key is derived, the
encryption key is derived from it and cached, then the password key is
discarded.

## Algorithms

| Purpose          | Algorithm                        | Library          |
| ---------------- | -------------------------------- | ---------------- |
| Hash / KDF       | BLAKE3 (keyed MAC mode)          | `@webbuf/blake3` |
| Encryption       | ACB3 (AES-256-CBC + BLAKE3-MAC)  | `@webbuf/acb3`   |
| Key pairs        | secp256k1                        | `@webbuf/secp256k1` |
| Rounds per tier  | 100,000 client-side, 100,000 server-side | |

## Implementation

All key derivation functions are in `webapp/src/lib/auth.ts`:

- `derivePasswordKey(password)` — Tier 1 (ephemeral)
- `deriveEncryptionKeyFromPasswordKey(passwordKey)` — Tier 2a
- `deriveLoginKeyFromPasswordKey(passwordKey)` — Tier 2b (ephemeral)
- `cacheEncryptionKey(encryptionKey)` — stores encryption key on client
- `getCachedEncryptionKey()` — retrieves cached encryption key
- `clearCachedEncryptionKey()` — clears on logout

Server-side hashing is in `webapp/src/server/user.server.ts`:

- `hashLoginKey(loginKeyHex)` — 100k rounds BLAKE3 PBKDF with server salt
