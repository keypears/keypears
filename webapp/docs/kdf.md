# Key Derivation

KeyPears uses a three-tier key derivation system to separate authentication
from encryption. The user's password is never stored anywhere. Instead, a
**password key** is derived from the password and cached in localStorage,
enabling all crypto operations without re-entering the password.

## The Three Tiers

```
Password (entered once, never stored)
  |
  | SHA-256 PBKDF, 100k rounds
  v
Password Key (cached in localStorage as hex)
  |
  +---> SHA-256 PBKDF, 100k rounds ---> Encryption Key (client-only)
  |
  +---> SHA-256 PBKDF, 100k rounds ---> Login Key (sent to server)
```

### Tier 1: Password -> Password Key

The password is combined with a deterministic salt (derived from the password
itself via HMAC) and run through 100,000 rounds of SHA-256 PBKDF. The result
is the **password key** -- a 256-bit intermediate secret.

The password key is cached in `localStorage` after the user enters their
password (on account save or login). This allows all subsequent crypto
operations without re-prompting for the password.

If the cached password key is missing (e.g. cleared localStorage, new device),
the user is prompted for their password to re-derive it.

### Tier 2a: Password Key -> Encryption Key

The encryption key is derived from the password key with a different salt and
another 100,000 rounds of PBKDF. It is used to encrypt and decrypt private
keys (secp256k1) using ACS2 (AES-256-CBC + SHA-256-HMAC).

The encryption key **never leaves the client**. It is not sent to the server,
not stored in localStorage, and not persisted anywhere. It is derived on-demand
from the cached password key when needed.

### Tier 2b: Password Key -> Login Key

The login key is derived from the password key with yet another salt and
100,000 rounds of PBKDF. It is sent to the server for authentication.

The server hashes the login key with an additional 100,000 rounds before
storing it in the database. This means an attacker who steals the database
must reverse 200,000 total rounds of PBKDF to recover the password key.

## Security Properties

**Separation of concerns.** Knowing the login key does not reveal the
encryption key, and vice versa. They are derived from the same password key
but with different salts, making them cryptographically independent.

**No raw password storage.** The password is used once to derive the password
key, then discarded. The password key in localStorage is a 256-bit hash --
not the password itself.

**Forward secrecy on logout.** The cached password key is cleared from
localStorage on logout. A stolen device after logout reveals nothing.

**Graceful fallback.** If localStorage is cleared, the user simply re-enters
their password. No data is lost -- the same password derives the same keys.

## Implementation

All key derivation functions are in `src/lib/auth.ts`:

- `derivePasswordKey(password)` -- Tier 1
- `deriveEncryptionKeyFromPasswordKey(passwordKey)` -- Tier 2a
- `deriveLoginKeyFromPasswordKey(passwordKey)` -- Tier 2b
- `cachePasswordKey(passwordKey)` -- stores in localStorage
- `getCachedPasswordKey()` -- retrieves from localStorage
- `clearCachedPasswordKey()` -- clears on logout

## Algorithms

- **Hash**: SHA-256 (via `@webbuf/sha256`)
- **KDF**: Iterated HMAC-SHA-256 (SHA-256 PBKDF)
- **Encryption**: ACS2 (AES-256-CBC + SHA-256-HMAC, via `@webbuf/acs2`)
- **Key pairs**: secp256k1 (via `@webbuf/secp256k1`)
- **Rounds**: 100,000 per tier on client, 100,000 on server

## Key Rotation

When rotating keys, a new secp256k1 key pair is generated. The private key is
encrypted with the encryption key (derived from the cached password key) and
stored in the `user_keys` table alongside the public key. The most recent key
is the active key.

## Password Change (Future)

When changing passwords, all encrypted private keys in `user_keys` must be
re-encrypted:

1. Derive old encryption key from old password key
2. Decrypt all private keys
3. Derive new password key from new password
4. Derive new encryption key from new password key
5. Re-encrypt all private keys
6. Derive new login key from new password key
7. Update server: new hashed login key + all re-encrypted private keys
8. Cache new password key in localStorage
