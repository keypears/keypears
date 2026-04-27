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
                                                          │ PBKDF2-HMAC-SHA-256, 600k rounds,
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
decrypt all four private keys — Ed25519 signing key, X25519 private key,
ML-DSA signing key, and ML-KEM decapsulation key — using AES-256-GCM.

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

The server hashes the login key with an additional 600,000 rounds of
PBKDF2-HMAC-SHA-256 using a **per-user salt** (derived deterministically from
the user's ID) before storing it in the database. The server path alone meets
the OWASP Password Storage Cheat Sheet recommendation of 600,000 rounds for
PBKDF2-HMAC-SHA-256, so the stretching is sufficient regardless of how much
work the client contributed.

An attacker who steals the database cannot brute-force the login key directly
— it is a uniformly random 256-bit value with a search space of 2^256. The
only realistic attack is a dictionary attack against the user's password. For
each candidate password, the attacker computes password → password key → login
key, then the stored hash. The first two client-side tiers use deterministic
protocol salts, so that work can be reused for the same candidate password
across users. The final 600,000-round server tier uses a per-user salt derived
from the user ID, so the server-side hashing work must be performed separately
for each target user.

## Security properties

**NIST-approved primitives.** All primitives are NIST-approved: SHA-256
(FIPS 180-4), HMAC-SHA-256 (FIPS 198-1), PBKDF2 (SP 800-132), AES-256-GCM
(SP 800-38D), Ed25519, X25519, ML-DSA-65 (FIPS 204), and ML-KEM-768 (FIPS 203). The server-side tier alone performs
600,000 rounds of PBKDF2-HMAC-SHA-256, matching the OWASP Password Storage
Cheat Sheet recommendation for PBKDF2-HMAC-SHA-256. The full
password-to-hash chain exceeds 1,200,000 rounds.

**Separation of concerns.** Knowing the encryption key does not reveal the
login key, and vice versa. They are derived from the same password key but
with different salts, making them cryptographically independent.

**No raw password storage.** The password is used once to derive the password
key, then discarded. The password key is used to derive the encryption key and
login key, then discarded. Only the encryption key is cached.

**If client storage is compromised:** The attacker gets the encryption key and
can decrypt all four private keys (Ed25519, X25519, ML-DSA, ML-KEM) if they
also obtain the encrypted key blobs. But they CANNOT derive the login key (it's
a sibling, not a child), and they also cannot recover the user's password.
Active origin compromise is stronger than storage-only theft: malicious script
or malware running as the user can combine session access with the cached
encryption key, fetch encrypted private-key blobs, and sign messages until the
session is revoked or keys are rotated.

**Graceful fallback.** If client storage is cleared, the user simply re-enters
their password. No data is lost — the same password derives the same keys.

**Login key never stored raw.** The server hashes the login key with 600,000
additional PBKDF2-HMAC-SHA-256 rounds, using a per-user salt, before storing.
A database breach reveals only hashes, not login keys, and the server-side
hashing work is target-specific because of the per-user salt.

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

When rotating keys, four new key pairs are generated: Ed25519, X25519,
ML-DSA-65, and ML-KEM-768. All four private keys are encrypted with the cached
encryption key and stored in the `user_keys` table alongside the public keys.
The most recent keys are the active keys. The new key's `loginKeyHash` is set
to match the user's current password hash.

If the cached encryption key is missing (cleared client storage, new device),
the user is prompted for their password. The password key is derived, the
encryption key is derived from it and cached, then the password key is
discarded.

## Algorithms

| Purpose         | Algorithm                                | Library                      |
| --------------- | ---------------------------------------- | ---------------------------- |
| Hash            | SHA-256                                  | `@webbuf/sha256`             |
| MAC             | HMAC-SHA-256                             | `@webbuf/sha256`             |
| KDF             | PBKDF2-HMAC-SHA-256 (RFC 8018)           | Web Crypto (`crypto.subtle`) |
| Encryption      | AES-256-GCM (AEAD)                       | `@webbuf/aesgcm`             |
| Classical signing  | Ed25519                                  | `@webbuf/ed25519`            |
| Classical DH       | X25519                                   | `@webbuf/x25519`             |
| PQ signing         | ML-DSA-65 (NIST, FIPS 204)               | `@webbuf/mldsa`              |
| PQ encryption      | ML-KEM-768 (NIST, FIPS 203)              | `@webbuf/mlkem`              |
| Rounds per tier | 300,000 client-side, 600,000 server-side |                              |

## Implementation

All key derivation functions are in `webapp/src/lib/auth.ts`:

- `derivePasswordKey(password)` — Tier 1 (ephemeral)
- `deriveEncryptionKeyFromPasswordKey(passwordKey)` — Tier 2a
- `deriveLoginKeyFromPasswordKey(passwordKey)` — Tier 2b (ephemeral)
- `cacheEncryptionKey(encryptionKey)` — stores encryption key on client
- `getCachedEncryptionKey()` — retrieves cached encryption key
- `clearCachedEncryptionKey()` — clears on logout

Server-side hashing is in `webapp/src/server/user.server.ts`:

- `hashLoginKey(loginKeyHex, userId)` — 600k rounds of PBKDF2-HMAC-SHA-256
  with a per-user salt derived from the user's ID
