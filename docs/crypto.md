# Cryptography Patterns

**Federated Diffie-Hellman Key Exchange System**

KeyPears is built on a foundation of decentralized Diffie-Hellman (DH) key
exchange, enabling secure communication between any two email addresses (e.g.,
`alice@example.com` ↔ `bob@example2.com`). This core capability supports both
password management and cryptocurrency wallet functionality.

## Decentralized Diffie-Hellman Key Exchange

**Note**: The DH key exchange infrastructure is planned and will be built on top
of the existing synchronization system already in place.

### Overview

KeyPears enables email-based identities to establish secure communication
channels via Diffie-Hellman key exchange:

- Each email address corresponds to a public/private key pair
- Users can establish shared secrets with any other email address across any
  domain
- No central authority needed for key exchange coordination
- Enables secure secret sharing and cryptocurrency wallet functionality

### Architecture

```
alice@example.com                    bob@example2.com
      ↓                                      ↓
  [DH Public Key A]    ←exchange→      [DH Public Key B]
  [DH Private Key A]                   [DH Private Key B]
      ↓                                      ↓
  Shared Secret = DH(Private A, Public B) = DH(Private B, Public A)
```

### Use Cases

1. **Secret Sharing**: Encrypt secrets with shared DH key for secure
   cross-domain sharing
2. **Cryptocurrency Wallets**: Use email addresses as wallet identities with
   DH-based secure communication
3. **Secure Messaging**: End-to-end encrypted messaging between any email
   addresses

---

## Vault Key Architecture

Each KeyPears vault has a single, immutable 32-byte secp256k1 private key called
the **vault key**. This key serves as the foundation for all vault operations.

### Vault Key Properties

**Immutability**: Once generated, a vault key never changes. This immutability
ensures:

- Consistent vault identity across all devices
- Reliable Diffie-Hellman key exchange with other vaults
- Predictable cryptographic operations

**secp256k1 Compatibility**: The vault key is a valid secp256k1 private key,
enabling:

- Elliptic curve Diffie-Hellman (ECDH) key exchange
- Cryptocurrency wallet functionality
- Public key derivation for vault identity verification

### Key Hierarchy

```
Vault Private Key (32 bytes)
  ↓ secp256k1 public key derivation
Vault Public Key (33 bytes, compressed)
  ↓ sha256Hash()
Vault PubKeyHash (32 bytes)
```

**Terminology**:

- **Vault Key** = **Vault Private Key** (32 bytes) - The master private key for
  the vault
- **Vault Public Key** (33 bytes) - Derived from vault private key using
  secp256k1
- **Vault PubKeyHash** = **Vault Public Key Hash** (32 bytes) - SHA-256 hash of
  public key

### Vault PubKeyHash (Public Identity)

Similar to Bitcoin's approach, KeyPears does not expose the raw public key
publicly. Instead, the **vault pubkeyhash** serves as the public vault identity:

```typescript
import { publicKeyCreate } from "@webbuf/secp256k1";
import { sha256Hash } from "@keypears/lib";

const vaultKey: FixedBuf<32> = /* 32-byte private key */;
const vaultPublicKey: FixedBuf<33> = publicKeyCreate(vaultKey); // Compressed
const vaultPubKeyHash: FixedBuf<32> = sha256Hash(vaultPublicKey.buf);
```

**Why hash the public key?**

- Hides the actual public key until needed for DH exchange
- Smaller size (32 bytes vs 33 bytes)
- Additional layer of security through hashing
- Follows Bitcoin's address derivation pattern
- Future-proof for more sophisticated privacy protocols

### Vault Creation Flow

```
User Password
  ↓ derivePasswordKey() - 100k rounds
Password Key (32 bytes)
  ↓ deriveEncryptionKey() - 100k rounds
Encryption Key (32 bytes)
  ↓
  ├─→ Generate random 32-byte vault key (secp256k1 private key)
  ├─→ Derive vault public key (33 bytes compressed)
  ├─→ Hash public key → vault pubkeyhash (32 bytes)
  └─→ Encrypt vault key with encryption key → store in database
```

**What's stored locally**:

- `encryptedVaultKey` (encrypted 32-byte private key)
- `vaultPubKeyHash` (32-byte hash of public key, unencrypted)

**What's stored on server**:

- `vaultPubKeyHash` (for vault lookup and future protocols)
- `hashedLoginKey` (for authentication)

**What's in memory only** (during vault unlock):

- Password key (derived from password)
- Encryption key (derived from password key)
- Vault key (decrypted vault private key)
- Vault public key (derived from vault private key, used for DH)

### Password Verification

To verify a password and unlock a vault:

```typescript
// 1. Derive keys from password
const passwordKey = derivePasswordKey(password);
const encryptionKey = deriveEncryptionKey(passwordKey);

// 2. Decrypt the vault key
const vaultKey = decryptKey(encryptedVaultKey, encryptionKey);

// 3. Derive public key from decrypted vault key
const vaultPublicKey = publicKeyCreate(vaultKey);

// 4. Hash the public key
const derivedPubKeyHash = sha256Hash(vaultPublicKey.buf);

// 5. Compare with stored pubkeyhash
if (derivedPubKeyHash.toHex() === storedVaultPubKeyHash) {
  // Password correct - vault unlocked
  // Keep vault key and public key in memory for vault operations
}
```

This approach:

- ✅ Never stores password key or encryption key on disk
- ✅ Verifies password by attempting decryption
- ✅ Confirms correct decryption via pubkeyhash comparison
- ✅ Avoids encrypting data just to compare encrypted values
- ✅ Hides actual public key until needed for DH exchange

### Key Rotation (Future)

Vault keys are immutable, but users can "rotate" keys by:

1. Creating a new vault with a new vault key
2. Re-pointing the name (`alice@keypears.com`) to the new vault
3. Migrating secrets to the new vault
4. The old vault remains accessible via its pubkeyhash

This name-to-vault indirection enables:

- Key rotation without breaking existing DH shared secrets
- Multiple vaults per name (staged migration)
- Vault recovery by re-pointing names

**Current status**: Not yet implemented. Each name has exactly one vault with
one immutable key.

### Diffie-Hellman Key Exchange with Quantum Protection

The vault key enables decentralized secret sharing between any two vaults using
a **derived public key system** that provides quantum resistance by hiding the
primary vault public key.

#### Key Protection Strategy

**Critical principle**: The primary vault public key is **never exposed to third
parties**. Instead, each communication channel uses deterministically derived
public keys unique to that relationship.

**Why this matters**:

- Quantum computers can theoretically break ECDH by deriving private keys from
  public keys
- If Alice's primary public key were exposed, a quantum attack could compromise
  all her communication channels
- By exposing only relationship-specific derived keys, a quantum attack on
  Alice↔Bob only compromises that channel
- Alice↔Carol remains secure because Bob never sees the derived key for that
  relationship

#### Derived Public Key Protocol

When `bob@hevybags.com` wants to communicate with `alice@keypears.com`:

```
Bob's Side:
1. Bob generates deterministic ephemeral key for Alice
2. Bob derives public key from ephemeral key
3. Bob sends derived public key to keypears.com server

Alice's Server (keypears.com):
4. Server uses Alice's primary private key + Bob's derived public key
5. Server generates Alice's derived public key for Bob
6. Server returns Alice's derived public key to Bob

Both Sides:
7. Alice uses: Alice primary private key + Bob derived public key → Shared Secret
8. Bob uses: Bob ephemeral private key + Alice derived public key → Shared Secret
9. Shared Secret matches (ECDH property)
```

**Key properties**:

- Each Alice↔Bob relationship has **immutable derived keys** (per vault)
- Bob never learns Alice's primary public key
- Alice never learns Bob's primary public key
- Compromising Alice↔Bob does not help attack Alice↔Carol
- Quantum attack surface limited to individual relationships

**What's exposed**:

- ✅ Vault pubkeyhash (32-byte SHA-256 hash) - public identifier
- ✅ Relationship-specific derived public keys (only to counterparty)
- ❌ Primary vault public key - **never exposed**
- ❌ Vault private key - **never leaves device**

**Quantum resistance properties**:

- Primary key protected: Cannot derive from hash or derived keys
- Limited attack surface: Each relationship isolated
- Forward secrecy: Compromising one channel doesn't cascade
- Graceful degradation: Quantum attack requires targeting each relationship
  individually

**Protocol details**: Not yet fully specified. The exact derivation mechanism
for relationship-specific keys is under development.

**Use cases**:

- Share passwords between vaults across domains
- Cryptocurrency wallet identity tied to email address
- End-to-end encrypted messaging with quantum protection

**Status**: Infrastructure in place, derived key protocol under development.

---

# Key Derivation System

KeyPears uses a three-tier key derivation system to protect user passwords and
vault encryption keys while enabling secure server authentication.

## Overview

The system derives three keys from a single master password through iterative
application of SHA-256-based PBKDF. The server then derives a fourth key for
secure database storage:

```
[CLIENT SIDE]
Master Password + Vault ID
  ↓ sha256Hmac(context: vaultId, data: password) → Vault-Specific Password
  ↓ sha256Pbkdf(vaultPassword, passwordSalt, 100k rounds)
Password Key (stored in device memory, encrypted with PIN)
  ↓
  ├→ sha256Pbkdf(passwordKey, encryptionSalt, 100k rounds) → Encryption Key (stays on device)
  └→ sha256Pbkdf(passwordKey, loginSalt, 100k rounds) → Login Key (sent to server)

[SERVER SIDE]
Login Key (received from client via HTTPS)
  ↓ sha256Hmac(context: vaultId, data: loginKey) → Salted Login Key (per-vault uniqueness)
  ↓ sha256Pbkdf(saltedLoginKey, serverLoginSalt, 100k rounds)
Hashed Login Key (stored in database)
```

## The Three Keys

### 1. Password Key

- **Derived from**: Vault ID + master password + password salt (100k rounds)
- **Two-step derivation**:
  1. SHA-256 HMAC with vault ID as context (per-vault uniqueness)
  2. SHA-256 PBKDF with password salt (100k rounds for computational cost)
- **Stored**: On device, encrypted with user's PIN
- **Purpose**: Intermediate key for deriving encryption and login keys
- **Never sent**: Neither to server nor used directly for encryption
- **Vault-specific**: Same password across different vaults → different password keys

**Why vault ID in client-side derivation?**

- **Defeats rainbow table attacks by malicious servers**:
  - Even with common password "password123", each vault has unique password key
  - Server cannot precompute `loginKey` without knowing specific `vaultId`
  - Since `vaultId` is random ULID, no practical rainbow table possible

- **Defense in depth**:
  - Client-side: Vault ID prevents rainbow tables
  - Server-side: Vault ID prevents password reuse detection
  - Combined: Maximum privacy and security

- **Architectural requirement**:
  - Client must obtain `vaultId` before deriving keys
  - For registration: Client generates `vaultId` (ULID), suggests to server
  - For unlock: Client retrieves `vaultId` from local SQLite
  - For import: Server provides `vaultId` during import flow

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

### 4. Hashed Login Key (Server-Side)

- **Derived from**: Login key + **vault ID (per-vault salt)** + server salt (100k rounds)
- **Purpose**: Database storage for authentication verification
- **Where derived**: On the server when login key is received
- **Stored in**: Server database only
- **Two-step process**:
  1. SHA-256 HMAC with vault ID as context (per-vault uniqueness)
  2. SHA-256 PBKDF with fixed salt (100k rounds for brute-force resistance)
- **Security**:
  - Same password across different vaults → different hashed values (prevents password reuse detection)
  - If database is compromised, attacker cannot use stored hash to authenticate
  - Must reverse both MAC and 100k KDF rounds, then 100k client-side rounds

**Per-Vault Salting Process:**

```typescript
// Server receives loginKey from client
const loginKeyBuf = FixedBuf.fromHex(32, loginKey);

// Step 1: Apply vault-specific HMAC (domain separation)
const saltedLoginKey = sha256Hmac(vaultId, loginKeyBuf);

// Step 2: Apply 100k rounds PBKDF for computational cost
const hashedLoginKey = deriveHashedLoginKey(saltedLoginKey);
```

**Why per-vault salting?**
- Prevents password reuse detection across vaults
- Two vaults with same password have different `hashedLoginKey` values
- Vault ID is immutable (unlike vault name), safe to use as long-term salt
- No information leakage about password patterns across vaults

**Why 100,000 rounds on server?**
- Maximum security: matches client-side 100k rounds for consistent protection
- Login key has already undergone 100,000 rounds of KDF client-side
- Server-side KDF prevents storing raw login key in database
- Total attacker cost: 100k + 100k rounds = 200k rounds (computationally impractical)

**Important**: The hashed login key is derived **server-side only**. The client
never computes or sends this value.

## Salt Derivation

### Password Salt

```typescript
derivePasswordSalt(password: string) → FixedBuf<32>
context = sha256Hash("KeyPears password salt v1")
return sha256Hmac(context, password)
```

Deterministic but unique per password.

### Encryption Salt

```typescript
deriveEncryptionSalt() → FixedBuf<32>
return sha256Hash("KeyPears encryption salt v1")
```

Global constant for all users.

### Login Salt

```typescript
deriveLoginSalt() → FixedBuf<32>
return sha256Hash("KeyPears login salt v1")
```

Global constant for all users.

### Server Hashed Login Key Salt

```typescript
deriveServerHashedLoginKeySalt() → FixedBuf<32>
return sha256Hash("KeyPears server login salt v1")
```

Global constant for all users. Used server-side only.

## Security Properties

### Defense in Depth

Each key is separated by 100,000 rounds of SHA-256 PBKDF. Even if one key is
compromised:

- **Server compromise** (login key stolen): Cannot derive password key or
  encryption key
- **Database theft** (hashed login key stolen): Cannot authenticate with it
  (would need to reverse 100k KDF rounds to get login key, then attacker still
  cannot derive password or decrypt vaults without reversing additional 100k rounds)
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
- On app resume/foreground, check if
  `current_time - last_auth_time >
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

## SHA-256 PBKDF

The key derivation function uses SHA-256 HMAC mode iteratively:

```typescript
sha256Pbkdf(password: string | WebBuf, salt: FixedBuf<32>, rounds: number)
  Round 1: result = sha256Hmac(salt, password)
  Round N: result = sha256Hmac(salt, previous_result)
  return result
```

Properties:

- 100,000 rounds completes in milliseconds
- Increases computational cost of brute-force attacks
- Not a standard KDF like PBKDF2, but cryptographically sound
- Uses SHA-256 HMAC (secure MAC construction)

## Server-Side KDF Security

The server uses **100,000 rounds** of KDF when hashing the login key, matching
the client's **100,000 rounds** for all its key derivations.

### Why Match Client Round Counts?

**Client-side (100k rounds)**:
- Primary security barrier against brute-force attacks
- Derives password key from user's password (protects weak passwords)
- Derives encryption key and login key from password key
- Must be computationally expensive to prevent password guessing

**Server-side (100k rounds)**:
- Maximum security: matches client-side protection level
- Login key has already undergone 100k rounds client-side
- Purpose is to avoid storing raw login key in database
- 100k rounds provides strong brute-force resistance on both sides

### Security Analysis

**Attacker scenarios**:

1. **Database compromised** (has hashed login key):
   - Must reverse 100k rounds to get login key ✓ (computationally expensive)
   - Then must reverse 100k rounds to get password key ✗ (impossible)
   - Cannot authenticate without reversing at least the 100k rounds
   - Cannot decrypt vaults without password key (requires reversing all 200k
     rounds)

2. **Network intercept** (captures login key over HTTPS):
   - Can authenticate directly (HTTPS compromise is outside threat model)
   - Still cannot decrypt vaults without encryption key
   - Cannot derive password key (100k rounds backwards)

**Conclusion**: 100,000 rounds on both client and server provides maximum
security. Total attacker cost is 200k rounds to derive the password key from
a compromised database.

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
- Vault key (decrypted)
- Decrypted vault secrets

What the server receives:

- Login key (via HTTPS, immediately KDF'd and discarded)

What the server stores:

- Hashed login key (result of KDF'ing login key)
- Encrypted vault key (only decryptable with encryption key derived from
  password)
- Vault pubkeyhash (public identifier)

Security guarantee: Even with full database access, attacker cannot:

- Authenticate (would need to reverse KDF to get login key)
- Decrypt vaults (would need encryption key, which requires password)
- Derive password from any stored values

## Authentication Flow

### Registration (Creating a Vault)

**Client side**:

1. User enters password
2. Derive password key: `sha256Pbkdf(password, passwordSalt, 100k)`
3. Derive encryption key: `sha256Pbkdf(passwordKey, encryptionSalt, 100k)`
4. Derive login key: `sha256Pbkdf(passwordKey, loginSalt, 100k)`
5. Generate random 32-byte vault key
6. Encrypt vault key with encryption key
7. Send to server:
   `{ name, domain, loginKey, encryptedVaultKey, vaultPubKeyHash }`

**Server side**:

1. Receive login key (unhashed)
2. Derive hashed login key: `sha256Pbkdf(loginKey, serverLoginSalt, 100k)` (100k
   rounds)
3. Store in database:
   `{ name, domain, hashedLoginKey, encryptedVaultKey, vaultPubKeyHash }`

**What's stored where**:

- Client device: `encryptedVaultKey`, `vaultPubKeyHash`
- Client memory (during session): `passwordKey`, `encryptionKey`, `vaultKey`
- Server database: `hashedLoginKey`, `encryptedVaultKey`, `vaultPubKeyHash`
- Sent over network: `loginKey` (via HTTPS only)

### Login (Importing an Existing Vault)

**Client side**:

1. User enters vault name and password
2. Derive password key: `sha256Pbkdf(password, passwordSalt, 100k)`
3. Derive login key: `sha256Pbkdf(passwordKey, loginSalt, 100k)`
4. Send to server: `{ vaultId, loginKey }`

**Server side**:

1. Receive login key (unhashed)
2. Derive hashed login key: `sha256Pbkdf(loginKey, serverLoginSalt, 100k)` (100k
   rounds)
3. Compare with stored `hashedLoginKey` in database
4. If match: return `{ encryptedVaultKey, vaultPubKeyHash }`
5. If no match: return `{ error: "Invalid password" }`

**Client side (after successful auth)**:

1. Receive encrypted vault key from server
2. Derive encryption key: `sha256Pbkdf(passwordKey, encryptionSalt, 100k)`
3. Decrypt vault key: `acs2Decrypt(encryptedVaultKey, encryptionKey)`
4. Verify password by deriving public key and comparing hash
5. Store vault locally

### API Authentication (For Secret Operations)

**Current implementation (MVP)**:

- Each API request includes login key in header: `X-KeyPears-Auth: <loginKey>`
- Server validates by computing: `sha256Pbkdf(loginKey, serverLoginSalt, 100k)`
  and comparing with stored `hashedLoginKey`
- Login key is the same across all devices for the same vault
- 100k rounds provides maximum security for authentication

**TODO - Future improvement**:

- Replace login key with per-device session tokens
- On login, server generates unique session token for that device
- Session token stored in client memory and server database
- API requests use session token instead of login key
- Benefits:
  - Can revoke individual devices without changing password
  - Audit log shows which device made which changes
  - More granular security (session expiration, device limits)
- For now, we use login key directly to get prototype working
