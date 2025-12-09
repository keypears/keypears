# KeyPears MVP Requirements

## Overview

KeyPears is a decentralized password manager and cryptocurrency wallet with an
email-like architecture. Users create vaults in the format `alice@keypears.com`
(or other domains), enabling cross-device synchronization and secure secret
sharing between any two addresses (e.g., `alice@keypears.com` ↔
`bob@wokerium.com`).

**MVP Goal**: Enable secure password management with cross-device sync,
Diffie-Hellman key exchange for secret sharing, AND revenue generation through
freemium model with premium subscriptions, working across all 5 supported
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
2. **Authentication**: Login key verification (SHA-256 hash of client-provided
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
- Free tier: 300 syncs/month, 50 shares/month, 500 secrets, 1GB storage
- Premium tier: $99/year for unlimited usage + custom domain support
- Client branding promotes official domains (like browsers have default search
  engines)
- Anyone can self-host with custom domain (open source, Apache 2.0)
- Revenue from official domain premium subscriptions

**Success Criteria**:

- Client ships with keypears.com, wokerium.com, hevybags.com as default options
- Users can add custom domain (e.g., `alice@mycompany.com`) and it works
- Secrets can be shared between official domains and custom domains
- Documentation exists for self-hosting KeyPears server

### Phase 4: Payment & Business Model

**Goal**: Enable revenue generation through freemium model with usage-based
limits.

**Requirements**:

1. **Free Tier Enforcement**:
   - Track sync operations per vault (300/month limit)
   - Track secret shares per vault (50/month limit)
   - Track secret count per vault (500 maximum)
   - Track storage usage per vault (1GB limit)
   - Server returns usage stats with each API call
   - Client shows usage indicators in UI
2. **Premium Tier Purchase Flow**:
   - Stripe integration for payment processing
   - "Upgrade to Premium" UI when limits reached
   - Stripe Checkout for $99/year subscription
   - Stripe Customer Portal for subscription management
   - Server webhook handling for subscription events
3. **Premium Tier Features**:
   - Custom domain support via `.well-known/keypears.json` protocol
   - Remove all usage limits (unlimited syncs, shares, secrets)
   - Increase storage to 10GB
   - Priority support flag on user account
4. **Usage Tracking API**:
   - `getUsageStats` - Return current usage vs limits for vault
   - `checkTierLimits` - Validate operation against tier limits before
     processing
   - Server stores: `vault.premiumTier` (free/premium), `vault.stripeCustomerId`
   - Monthly reset of sync/share counters
5. **Payment UI**:
   - Usage meters on dashboard ("150/300 syncs this month")
   - Upgrade prompts when approaching limits (80% = warning, 100% = block)
   - Premium badge display for custom domain users
   - Settings page with "Manage Subscription" link to Stripe portal

**Success Criteria**:

- Free user hits 300 syncs/month → sees "Upgrade to Premium" prompt
- Free user attempts 301st sync → blocked with upgrade modal
- User clicks "Upgrade" → Stripe Checkout opens → successful payment
- After payment, user's `premiumTier` updates to 'premium' via webhook
- Premium user has unlimited syncs/shares, can add custom domain
- Premium user can manage subscription via Stripe Customer Portal

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

- Hashed login keys (SHA-256 hash for authentication)
- Encrypted master vault keys (cannot decrypt)
- Encrypted secret updates (cannot decrypt)
- DH public keys (public by design)

### Three-Tier Key Derivation

```
User Password
     ↓ (sha256Pbkdf 100k rounds)
Password Key (32 bytes, stored on device encrypted with PIN)
     ↓                              ↓
     ↓ (sha256Pbkdf 100k rounds)    ↓ (sha256Pbkdf 100k rounds)
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

- **Hashing/KDF**: SHA-256 (via @webbuf/sha256 WASM)
- **Encryption**: ACS2 = AES-256-CBC + SHA-256-HMAC (via @webbuf/acs2 WASM)
- **Key size**: 256 bits (32 bytes) for all keys
- **Password policy**: Minimum 8 characters (default: lowercase-only for ~75
  bits entropy)

## Technical Stack

### Client

- **Language**: TypeScript
- **Framework**: React Router 7 (SSR + type-safe routing)
- **Database**: SQLite (via Tauri SQL plugin)
- **ORM**: Drizzle ORM
- **Crypto**: WASM packages (@webbuf/sha256, @webbuf/acs2, @webbuf/fixedbuf)
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
9. **Business tier** - Multi-user management, admin dashboard (deferred to
   post-MVP)
10. **Self-hosted server installer** - One-click deploy for custom domains
    (Phase 4+)

**Note**: Payment system (Phase 4) is IN SCOPE for MVP - we must charge money to
have a real product.

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
11. ✅ Free tier limits enforced (300 syncs, 50 shares, 500 secrets per month)
12. ✅ User can purchase Premium tier ($99/year) via Stripe
13. ✅ Premium users can add custom domain via `.well-known/keypears.json`
14. ✅ Usage tracking works correctly (counters reset monthly, limits enforced)
15. ✅ Stripe webhooks update premium status in real-time

**User Story**:

> Alice installs KeyPears on her MacBook, creates vault `alice@keypears.com`,
> adds her Gmail password. She installs KeyPears on her iPhone, logs in, sees
> Gmail password synced. She shares her Netflix password with her roommate Bob
> (`bob@wokerium.com`). Bob receives encrypted password, accepts it into his
> vault, logs into Netflix. Alice changes Netflix password on her phone, change
> syncs to MacBook and Bob receives updated password.
>
> **Premium Flow**: After 2 months of heavy usage, Alice hits her 300
> syncs/month limit. She sees "Upgrade to Premium" prompt, clicks it, pays
> $99/year via Stripe. She then adds her custom domain `alice@alicecompany.com`
> via `.well-known/keypears.json` and enjoys unlimited usage.

## Timeline Estimate

- **Phase 1 (Sync)**: 3-5 days
- **Phase 2 (DH Key Exchange)**: 3-5 days
- **Phase 3 (Multi-Domain)**: 2-3 days
- **Phase 4 (Payment & Business)**: 3-4 days
- **Testing & Polish**: 2-3 days
- **Total MVP**: 15-20 days of focused development

## Post-MVP Roadmap Considerations

After MVP ships, prioritize based on user feedback:

1. Browser extensions (most requested for password managers)
2. Biometric unlock (mobile users expect this)
3. Team vaults (enterprise adoption)
4. Additional secret types (crypto wallet users need this)
5. Localhost-only vaults (privacy-focused users)
6. Self-hosted server installer (open source community)
