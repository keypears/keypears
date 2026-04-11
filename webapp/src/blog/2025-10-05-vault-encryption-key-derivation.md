+++
title = "How KeyPears Protects Your Vault: Encryption and Key Derivation"
date = "2025-10-05T06:00:00-05:00"
author = "KeyPears Team"
+++

One of the core security features of KeyPears is how we protect your vault
encryption keys. Today, we're diving deep into our three-tier key derivation
system and explaining how we ensure that even if a server is compromised, your
encrypted data remains secure.

## The Problem: Authentication vs. Encryption

Most password managers face a fundamental challenge: you need to send
_something_ to the server to prove who you are, but you also need to keep your
encryption key secret so the server can't decrypt your vault. Using the same key
for both purposes creates a security vulnerability—if the server is compromised,
an attacker gains access to your encryption key.

KeyPears solves this by deriving two separate keys from your password: one for
logging in to the server, and one for encrypting your vault. The server only
ever sees the login key, never the encryption key.

## Three-Tier Key Derivation

When you create a vault in KeyPears, we don't just hash your password once.
Instead, we use a three-tier key derivation system:

```
Master Password
  ↓ blake3Pbkdf (100,000 rounds)
Password Key (stored encrypted with PIN on device)
  ↓
  ├→ blake3Pbkdf (100,000 rounds) → Encryption Key
  └→ blake3Pbkdf (100,000 rounds) → Login Key
```

### 1. Password Key: The Root of Trust

The first step derives a **password key** from your master password using
100,000 rounds of our Blake3-based PBKDF. This intermediate key is stored on
your device, encrypted with your PIN for quick unlock. It never leaves your
device and is never sent to any server.

The password key acts as the root of trust for deriving the other two keys.

### 2. Encryption Key: Protecting Your Vault

From the password key, we derive an **encryption key** through another 100,000
rounds of Blake3 PBKDF. This key is used for one purpose only: encrypting and
decrypting your master vault key.

Wait—encrypting a key with another key? Yes! Your vault itself is encrypted with
a randomly generated **master vault key**. This master key is immutable and
never changes. The encryption key derived from your password is used to encrypt
this master vault key before storing it in the database.

This architecture allows you to change your password without re-encrypting your
entire vault—we just re-encrypt the master vault key with the new encryption
key.

The encryption key is ephemeral. We derive it when needed, use it immediately,
and discard it. It is never persisted to disk and never sent anywhere.

### 3. Login Key: Server Authentication

The third key in our hierarchy is the **login key**, also derived from the
password key through 100,000 rounds of Blake3 PBKDF. This is the only key that
gets sent to the server for authentication.

Because the login key is derived separately from the encryption key,
compromising one doesn't compromise the other. Even if a server is breached and
the login key is stolen, the attacker cannot derive the encryption key needed to
decrypt your vault.

## Blake3 PBKDF: Fast and Secure

You might notice we're using 100,000 rounds of Blake3 PBKDF rather than a
standard algorithm like PBKDF2. Blake3 is a modern, extremely fast cryptographic
hash function. Even at 100,000 rounds, the entire key derivation completes in
milliseconds on modern hardware.

Our Blake3-based PBKDF works by iteratively applying Blake3's keyed MAC mode:

```
Round 1: result = blake3Mac(salt, password)
Round 2: result = blake3Mac(salt, result_from_round_1)
...
Round 100,000: result = blake3Mac(salt, result_from_round_99,999)
```

Each round adds computational cost for attackers trying to brute-force your
password, while remaining fast enough for legitimate use.

## Salt Derivation

Each key derivation uses a different salt to ensure cryptographic separation:

- **Password Salt**: Derived deterministically from your password using
  `blake3Mac(blake3Hash("KeyPears password salt v1"), password)`. This ensures
  the same password always produces the same password key.

- **Encryption Salt**: A global constant
  `blake3Hash("KeyPears encryption salt v1")` used for all users. This is safe
  because the encryption key is derived from the password key, not directly from
  the password.

- **Login Salt**: Another global constant
  `blake3Hash("KeyPears login salt v1")`. Again, safe because it's derived from
  the password key.

## Security Properties

This architecture provides several important security guarantees:

### Defense Against Server Compromise

If a KeyPears server is compromised, the attacker gains access to:

- Encrypted vault data
- Login keys for authentication

The attacker does NOT gain access to:

- Master passwords
- Password keys
- Encryption keys
- Master vault keys
- Decrypted vault contents

Without the encryption key, the encrypted vault data is useless to the attacker.

### Defense Against Encrypted Data Theft

If someone steals your encrypted vault data but doesn't have your credentials:

- They cannot decrypt it without the encryption key
- The encryption key requires the password key
- The password key requires your master password
- 100,000 rounds of Blake3 PBKDF make brute-forcing expensive

### Key Separation

The three keys are cryptographically isolated. Knowing the login key doesn't
help you derive the encryption key, and vice versa. Both require the password
key, which requires the master password.

## The Vault Key Hash: Verification

When you enter your password to unlock a vault, KeyPears needs to verify you
entered it correctly. We do this by storing a Blake3 hash of the master vault
key in the database.

When you unlock:

1. Derive password key from your password
2. Derive encryption key from password key
3. Decrypt the master vault key using the encryption key
4. Hash the decrypted master vault key
5. Compare with the stored hash

If the hashes match, you entered the correct password. If not, the password is
wrong. This verification happens entirely on your device—the master vault key
never leaves your device, even temporarily.

## Putting It All Together

Here's what happens when you create a new vault:

1. You enter a master password
2. KeyPears derives a password key (100k rounds Blake3)
3. Derives an encryption key from the password key (100k rounds Blake3)
4. Generates a random master vault key
5. Encrypts the master vault key with the encryption key
6. Hashes the master vault key for verification
7. Stores the encrypted vault key and hash in your local database

When you sync to a server:

1. Derive the login key from your password key (100k rounds Blake3)
2. Send the login key to the server for authentication
3. Server returns your encrypted master vault key (and other encrypted vault
   data)
4. Derive the encryption key (never sent to server)
5. Decrypt the master vault key locally
6. Use the master vault key to decrypt your secrets

The server facilitates synchronization but never has the keys needed to decrypt
your data.

## Looking Ahead

This architecture lays the foundation for secure sharing between users. In
future posts, we'll explore how KeyPears uses Diffie-Hellman key exchange to
share secrets securely between users, and how the master vault key enables
efficient re-encryption without re-deriving keys.

For now, the key takeaway is simple: KeyPears separates authentication from
encryption. Your server can verify who you are without ever having the ability
to decrypt your data. It's cryptography working exactly as it should.
