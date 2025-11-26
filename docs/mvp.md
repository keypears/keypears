# KeyPears MVP Requirements

## Overview

KeyPears is a decentralized password manager and cryptocurrency wallet with an
email-like architecture. Users create vaults in the format `alice@keypears.com`
(or other domains), enabling cross-device synchronization and secure secret
sharing between any two addresses (e.g., `alice@keypears.com` ↔
`bob@wokerium.com`).

**MVP Goal**: Enable secure password management with cross-device sync and
Diffie-Hellman key exchange for secret sharing, working across all 5 supported
platforms (Windows, macOS, Linux, Android, iOS).

## Core Architecture Decisions

### Server Requirement (MVP)

**Decision**: All vaults require a server for the MVP.

- Vault format: `alice@keypears.com` (not `alice@localhost`)
- Servers coordinate synchronization and DH key exchange
- Zero-knowledge encryption: servers never see plaintext secrets
- Always-on internet assumption (standard for modern password managers)

### Future Localhost Support (Post-MVP)

**Design Constraint**: The client architecture must not block future support for
localhost-only vaults.

**Implementation Approach**:

- Use optional `serverVaultName` field in client vault schema
- When `serverVaultName` is null → vault is local-only (`alice@localhost`)
- When `serverVaultName` is set → vault syncs to server (`alice@keypears.com`)
- Sync service checks `serverVaultName` before attempting sync operations
- All vault operations work identically regardless of sync status

**Example Schema**:

```typescript
// Client SQLite schema
export const TableVault = sqliteTable("vault", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  serverVaultName: text("server_vault_name").unique(), // null = local-only, set = synced
  lastSyncTimestamp: integer("last_sync_timestamp"),
  // ... other fields
});
```

**This ensures**:

- MVP can ship with `serverVaultName` always set (server-required)
- Post-MVP can add "Create local-only vault" option (sets `serverVaultName` to
  null)
- Migration path: `@localhost` → `@keypears.com` by setting `serverVaultName`
  field
- No dual code paths until post-MVP when localhost support is actually added

## MVP Features

### Phase 1: Cross-Device Synchronization

**Goal**: Users can access passwords from any device.

**Requirements**:

1. **Server-side secret storage**: PostgreSQL table storing append-only secret
   updates
2. **Authentication**: Login key verification (Blake3 hash of client-provided
   login key)
3. **Sync API**:
   - `createVault` - Register new vault on server
   - `authenticateVault` - Verify login key, return encrypted master key
   - `pushSecretUpdates` - Upload local changes to server
   - `pullSecretUpdates` - Download server changes since last sync
4. **Client sync service**: Background sync with conflict resolution
   (last-write-wins)
5. **Sync UI indicators**:
   - ☁️ Synced
   - 🔄 Syncing...
   - ⚠️ Sync error
   - 📶 Offline (queued)

**Success Criteria**:

- Create password on Device A → appears on Device B within 30 seconds
- Works offline: changes queue and sync when connection restored
- Handles conflicts: last write wins based on timestamp

### Phase 2: Diffie-Hellman Key Exchange

**Goal**: Users can securely share secrets with any other vault address.

**Requirements**:

1. **DH public key registration**: Each vault publishes a DH public key to
   server
2. **Cross-domain key discovery**: Fetch public key for `bob@wokerium.com` from
   wokerium.com server
3. **Secret sharing API**:
   - `registerPublicKey` - Publish DH public key
   - `getPublicKey` - Fetch recipient's public key
   - `sendSecret` - Encrypt and send secret to recipient's server
   - `receiveSecrets` - Poll for pending encrypted secrets
4. **Client DH service**:
   - Generate DH keypair on vault creation
   - Encrypt secrets with shared DH key
   - Decrypt received secrets
5. **Sharing UI**:
   - "Share Secret" button on password detail page
   - Modal: "Share with: bob@wokerium.com"
   - Inbox: List of received secrets
   - Accept/Reject flow

**Success Criteria**:

- Alice (`alice@keypears.com`) shares GitHub password with Bob
  (`bob@wokerium.com`)
- Bob receives encrypted secret, decrypts with his vault password
- Bob can accept secret into his vault or reject it
- Works across different domain servers (keypears.com → wokerium.com)

### Phase 3: Multi-Domain Support

**Goal**: Support multiple official domains with open protocol for self-hosting.

**Official Domains** (default options in client):

1. **keypears.com** - Primary branding, main domain
2. **wokerium.com** - Alternative branding option
3. **hevybags.com** - Alternative branding option

**Requirements**:

1. **Domain discovery**: Client can connect to any KeyPears-compatible server
2. **Protocol compatibility**: All servers implement identical orpc API
3. **Federated sync**: `alice@keypears.com` can share with `bob@wokerium.com`
4. **Custom domain UI**:
   - Default dropdown: keypears.com, wokerium.com, hevybags.com
   - "Custom domain" option for self-hosted servers
   - Domain validation and connectivity check
5. **Open source deployment guide**: Instructions for running your own KeyPears
   server

**Business Model**:

- Official domains are advertised and supported
- Client branding promotes official domains (like browsers have default search
  engines)
- Anyone can self-host with custom domain (open source, Apache 2.0)
- Revenue from official domains (ads, premium features, licensing)

**Success Criteria**:

- Client ships with keypears.com, wokerium.com, hevybags.com as default options
- Users can add custom domain (e.g., `alice@mycompany.com`) and it works
- Secrets can be shared between official domains and custom domains
- Documentation exists for self-hosting KeyPears server

## Platform Requirements

All MVP features must work on:

1. **Windows** (desktop app via Tauri)
2. **macOS** (desktop app via Tauri)
3. **Linux** (desktop app via Tauri)
4. **Android** (mobile app via Tauri)
5. **iOS** (mobile app via Tauri)

## Security Requirements

### Zero-Knowledge Architecture

**Server never has access to**:

- Plaintext passwords
- Plaintext secrets
- Master vault keys (stored encrypted)
- Password keys (derived client-side only)
- Encryption keys (derived client-side only)

**Server only stores**:

- Hashed login keys (Blake3 hash for authentication)
- Encrypted master vault keys (cannot decrypt)
- Encrypted secret updates (cannot decrypt)
- DH public keys (public by design)

### Three-Tier Key Derivation

```
User Password
     ↓ (blake3Pbkdf 100k rounds)
Password Key (32 bytes, stored on device encrypted with PIN)
     ↓                              ↓
     ↓ (blake3Pbkdf 100k rounds)    ↓ (blake3Pbkdf 100k rounds)
Encryption Key                 Login Key
     ↓                              ↓
Encrypts/decrypts              Sent to server (hashed again server-side)
master vault key               for authentication
```

**Key Properties**:

- Login key compromise → cannot derive encryption key
- Server compromise → cannot decrypt any secrets
- Password key stored on device (encrypted with PIN for quick unlock)

### Cryptography Stack

- **Hashing/KDF**: Blake3 (via @webbuf/blake3 WASM)
- **Encryption**: ACB3 = AES-256-CBC + Blake3-MAC (via @webbuf/acb3 WASM)
- **Key size**: 256 bits (32 bytes) for all keys
- **Password policy**: Minimum 8 characters (default: lowercase-only for ~75
  bits entropy)

## Technical Stack

### Client

- **Language**: TypeScript
- **Framework**: React Router 7 (SSR + type-safe routing)
- **Database**: SQLite (via Tauri SQL plugin)
- **ORM**: Drizzle ORM
- **Crypto**: WASM packages (@webbuf/blake3, @webbuf/acb3, @webbuf/fixedbuf)
- **UI**: shadcn components + Catppuccin theme
- **Desktop**: Tauri 2.0 (minimal Rust backend, ~33 lines)
- **Mobile**: Tauri 2.0 (iOS + Android support)

### Server

- **Language**: TypeScript (Node.js)
- **Framework**: orpc (type-safe RPC with zero codegen)
- **Database**: PostgreSQL 17.5
- **ORM**: Drizzle ORM
- **Deployment**: AWS Fargate (Docker containers, linux/amd64)
- **Domain**: keypears.com (primary), wokerium.com, hevybags.com (alternatives)

### Data Model

**Append-Only Log**:

- Secrets are never modified or deleted (only tombstoned)
- Each change creates a new `secret_update` entry
- Last-write-wins conflict resolution based on timestamp
- Eventually consistent across devices

**Primary Keys**:

- ULID (time-ordered, collision-resistant)
- Sortable by creation time
- No coordination needed for ID generation

## Out of Scope for MVP

The following features are explicitly deferred to post-MVP:

1. **Localhost-only vaults** (`alice@localhost`) - Architecture supports it, not
   shipping in MVP
2. **Team vaults** - Shared vaults with role-based access (deferred)
3. **Browser extensions** - Chrome/Firefox password autofill (deferred)
4. **Biometric unlock** - Fingerprint/Face ID (deferred, PIN unlock only for
   MVP)
5. **Two-factor authentication** - TOTP/WebAuthn support (deferred)
6. **Secret types beyond passwords** - API keys, wallet keys, SSH keys (schema
   supports, UI deferred)
7. **Password breach checking** - HaveIBeenPwned integration (deferred)
8. **Advanced sharing** - Expiring shares, view-only shares (deferred)
9. **Audit logs** - Detailed access history beyond basic timestamps (deferred)
10. **Self-hosted server installer** - One-click deploy for custom domains
    (Phase 3+)

## Success Metrics

**MVP is complete when**:

1. ✅ User can create vault at `alice@keypears.com`
2. ✅ User can create/edit/delete passwords on any device
3. ✅ Changes sync to all devices within 30 seconds
4. ✅ User can share password with `bob@keypears.com` via DH key exchange
5. ✅ Bob receives, decrypts, and imports shared password
6. ✅ All features work on Windows, macOS, Linux, Android, iOS
7. ✅ Server supports keypears.com + wokerium.com + hevybags.com domains
8. ✅ User can add custom domain server (with manual domain entry)
9. ✅ Cross-domain sharing works (keypears.com ↔ wokerium.com)
10. ✅ Zero-knowledge architecture verified (server cannot decrypt secrets)

**User Story**:

> Alice installs KeyPears on her MacBook, creates vault `alice@keypears.com`,
> adds her Gmail password. She installs KeyPears on her iPhone, logs in, sees
> Gmail password synced. She shares her Netflix password with her roommate Bob
> (`bob@wokerium.com`). Bob receives encrypted password, accepts it into his
> vault, logs into Netflix. Alice changes Netflix password on her phone, change
> syncs to MacBook and Bob receives updated password.

## Timeline Estimate

- **Phase 1 (Sync)**: 3-5 days
- **Phase 2 (DH Key Exchange)**: 3-5 days
- **Phase 3 (Multi-Domain)**: 2-3 days
- **Testing & Polish**: 2-3 days
- **Total MVP**: 10-15 days of focused development

## Post-MVP Roadmap Considerations

After MVP ships, prioritize based on user feedback:

1. Browser extensions (most requested for password managers)
2. Biometric unlock (mobile users expect this)
3. Team vaults (enterprise adoption)
4. Additional secret types (crypto wallet users need this)
5. Localhost-only vaults (privacy-focused users)
6. Self-hosted server installer (open source community)
