# Vault Key Architecture

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

## Vault Key Properties

Each KeyPears vault has a single, immutable 32-byte secp256k1 private key called
the **vault key**. This key serves as the foundation for all vault operations.

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

- Never stores password key or encryption key on disk
- Verifies password by attempting decryption
- Confirms correct decryption via pubkeyhash comparison
- Avoids encrypting data just to compare encrypted values
- Hides actual public key until needed for DH exchange

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

---

## Diffie-Hellman Key Exchange with Quantum Protection

The vault key enables decentralized secret sharing between any two vaults using
an **engagement key system** that provides quantum resistance by hiding the
primary vault public key.

### Key Protection Strategy

**Critical principle**: The primary vault public key is **never exposed to third
parties**. Instead, each communication channel uses deterministically derived
engagement keys unique to that relationship.

**Why this matters**:

- Quantum computers can theoretically break ECDH by deriving private keys from
  public keys
- If Alice's primary public key were exposed, a quantum attack could compromise
  all her communication channels
- By exposing only relationship-specific engagement keys, a quantum attack on
  Alice↔Bob only compromises that channel
- Alice↔Carol remains secure because Bob never sees the engagement key for that
  relationship

### Engagement Key Protocol

When `bob@passapples.com` wants to communicate with `alice@keypears.com`:

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

- Each Alice↔Bob relationship has **immutable engagement keys** (per vault)
- Bob never learns Alice's primary public key
- Alice never learns Bob's primary public key
- Compromising Alice↔Bob does not help attack Alice↔Carol
- Quantum attack surface limited to individual relationships

**What's exposed**:

- Vault pubkeyhash (32-byte SHA-256 hash) - public identifier
- Relationship-specific engagement public keys (only to counterparty)
- Primary vault public key - **never exposed**
- Vault private key - **never leaves device**

**Quantum resistance properties**:

- Primary key protected: Cannot derive from hash or engagement keys
- Limited attack surface: Each relationship isolated
- Forward secrecy: Compromising one channel doesn't cascade
- Graceful degradation: Quantum attack requires targeting each relationship
  individually

**Protocol details**: Not yet fully specified. The exact derivation mechanism
for relationship-specific engagement keys is under development.

**Use cases**:

- Share passwords between vaults across domains
- Cryptocurrency wallet identity tied to email address
- End-to-end encrypted messaging with quantum protection

**Status**: Infrastructure in place, engagement key protocol under development.

---

## Related Documentation

- [Key Derivation Functions](./kdf.md) - Password-based key derivation system
- [Diffie-Hellman Protocol](./dh.md) - Federated DH key exchange protocol
- [Engagement Keys](./engagement-keys.md) - Server-generated engagement keys
