# Key Derivation System

KeyPears uses a three-tier key derivation system to protect user passwords and
vault encryption keys while enabling secure server authentication.

## Overview

The system derives three keys from a single master password through iterative
application of Blake3-based PBKDF:

```
Master Password
  ↓ blake3Pbkdf(password, passwordSalt, 100k rounds)
Password Key (cached on device, encrypted with PIN)
  ↓
  ├→ blake3Pbkdf(passwordKey, encryptionSalt, 100k rounds) → Encryption Key
  └→ blake3Pbkdf(passwordKey, loginSalt, 100k rounds) → Login Key
```

## The Three Keys

### 1. Password Key

- **Derived from**: Master password + password salt (100k rounds)
- **Stored**: On device, encrypted with user's PIN
- **Purpose**: Intermediate key for deriving encryption and login keys
- **Never sent**: Neither to server nor used directly for encryption

### 2. Encryption Key

- **Derived from**: Password key + encryption salt (100k rounds)
- **Purpose**: Encrypts/decrypts the master vault key
- **Storage**: Ephemeral, re-derived when needed
- **Never sent**: Stays on device only

### 3. Login Key

- **Derived from**: Password key + login salt (100k rounds)
- **Purpose**: Server authentication credential
- **Sent to**: Server for user authentication
- **Cannot derive**: Password key or encryption key (computationally
  impractical)

## Salt Derivation

### Password Salt

```typescript
derivePasswordSalt(password: string) → FixedBuf<32>
context = blake3Hash("KeyPears password salt v1")
return blake3Mac(context, password)
```

Deterministic but unique per password.

### Encryption Salt

```typescript
deriveEncryptionSalt() → FixedBuf<32>
return blake3Hash("KeyPears encryption salt v1")
```

Global constant for all users.

### Login Salt

```typescript
deriveLoginSalt() → FixedBuf<32>
return blake3Hash("KeyPears login salt v1")
```

Global constant for all users.

## Security Properties

### Defense in Depth

Each key is separated by 100,000 rounds of Blake3 PBKDF. Even if one key is
compromised:

- **Server compromise** (login key stolen): Cannot derive password key or
  encryption key
- **Encrypted vault theft**: Cannot decrypt without encryption key
- **Login key interception**: Cannot access vault data

### Key Separation

The three keys are cryptographically isolated:

- Login key ≠ f(encryption key)
- Encryption key ≠ f(login key)
- Both require password key, which requires master password

### PIN Security Tradeoff

Password key is cached on device encrypted with PIN for convenience. This means:

- **Benefit**: Quick unlock without re-entering full password
- **Tradeoff**: Physical device access + PIN brute-force = vault access
- **Mitigation**: Standard practice in password managers (1Password, etc.)

### PIN Expiration Strategy

To limit the security exposure of PIN-based quick unlock, the PIN key expires
after a configurable time period, requiring full password re-entry.

**Storage:**

- **PIN key**: In-memory only (Rust state, never persisted)
- **Encrypted password key**: Persisted in database
- **Last authentication timestamp**: In-memory (Rust state)
- **Expiration policy**: Stored in database (e.g., "expire after 1 hour")

**Expiration mechanism:**

- **Timestamp-based**, not real-time timers (mobile platforms don't support
  reliable background execution)
- On app resume/foreground, check if `current_time - last_auth_time >
  expiration_duration`
- If expired: clear PIN key from memory, require full password
- If not expired: allow PIN unlock

**Platform-specific behavior:**

- **iOS/Android**: Apps suspended in background, timers don't run reliably. OS
  often kills process entirely (clearing memory automatically). Expiration check
  runs on app resume.
- **Desktop (Windows/macOS/Linux)**: Optionally run background timer for
  real-time expiration as additional security layer. Timestamp check on app
  focus is primary mechanism.

**Key deletion:**

- Use `zeroize` crate to securely overwrite key bytes in memory before dropping
- On mobile, OS process termination provides additional security (keys cleared
  by OS)

## Blake3 PBKDF

The key derivation function uses Blake3's keyed MAC mode iteratively:

```typescript
blake3Pbkdf(password: string | WebBuf, salt: FixedBuf<32>, rounds: number)
  Round 1: result = blake3Mac(salt, password)
  Round N: result = blake3Mac(salt, previous_result)
  return result
```

Properties:

- 100,000 rounds completes in milliseconds (Blake3 speed)
- Increases computational cost of brute-force attacks
- Not a standard KDF like PBKDF2, but cryptographically sound
- Uses Blake3's keyed mode (secure MAC construction)

## Sync Flow

When syncing a vault to a new device:

1. User enters master password
2. Derive password key (100k rounds)
3. Derive login key → authenticate to server
4. Server returns encrypted master vault key
5. Derive encryption key → decrypt master vault key
6. Use master vault key to decrypt vault secrets

The server never has access to:

- Master password
- Password key
- Encryption key
- Master vault key
- Decrypted vault secrets

Only the login key is sent to the server for authentication.
