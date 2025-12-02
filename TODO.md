# KeyPears MVP TODO

This document tracks all tasks required to complete the KeyPears MVP. Tasks are
organized by MVP phase as defined in `docs/mvp.md`.

---

## Recently Completed

### Third-Party API Hosting Foundation ✅

**Completed**: 2025-12-01

**Blog Post**:
[Third-Party Hosting: Making KeyPears as Easy as Hosted
Email](/blog/2025-12-01-third-party-hosting)

Updated the KeyPears protocol to read API URLs from `.well-known/keypears.json`
instead of constructing them from domain names. This lays the foundation for
third-party API hosting where users can run their website at `example.com` but
have their KeyPears API hosted by a provider like `keypears.com`.

**What was implemented:**

- `KeypearsJsonSchema` Zod schema in `@keypears/lib`
- Dynamic `.well-known/keypears.json` route in webapp
- Updated `validateKeypearsServer()` to return `apiUrl`
- Updated Tauri app to fetch and cache API URLs from `keypears.json`

**Still needed (future work):**

- Domain ownership verification (public key in `keypears.json`)

---

## Phase 1: Cross-Device Synchronization

**Status**: ✅ **COMPLETED**

**Goal**: Users can access passwords from any device via server synchronization.

### Client Foundation ✅ COMPLETED

- [x] SQLite database with append-only secret updates (tauri-ts)
- [x] Vault model with ULID primary keys
- [x] Secret update model with JSON storage
- [x] Three-tier key derivation (password key → encryption key + login key)
- [x] Vault creation wizard (name + password steps)
- [x] Password generator with entropy calculation
- [x] Current secrets view (last-write-wins resolution)

### Server Foundation ✅ COMPLETED

- [x] PostgreSQL database schema
- [x] Vault table with encrypted master keys
- [x] orpc API server setup
- [x] Blake3 hashing endpoint (proof of concept)

### Phase 1 Tasks ✅ COMPLETED

#### Server-Side Secret Storage ✅ COMPLETED

- [x] Create `secret_update` table in PostgreSQL
  - [x] Schema: `id`, `vault_id`, `secret_id`, `global_order`, `local_order`,
        `encrypted_blob`, `created_at`
  - [x] Indexes: `idx_vault_global_order`, `idx_secret_local_order`
  - [x] Drizzle schema in `api-server/src/db/schema.ts`

**Implementation notes**: Schema uses `encrypted_blob` instead of separate
plaintext fields (`name`, `type`, `deleted`). This is a better zero-knowledge
design - server only sees encrypted data.

#### Authentication API ✅ COMPLETED

- [x] `registerVault` procedure (`api-server/src/procedures/register-vault.ts`)
  - [x] Accepts: `vaultId`, `name`, `domain`, `vaultPubKeyHash`, `loginKey`,
        `encryptedVaultKey`
  - [x] Validates vault name and domain
  - [x] KDFs login key with vault ID salt (1k rounds)
  - [x] Stores vault record in PostgreSQL
  - [x] Returns: vault ID

- [x] `login` procedure (`api-server/src/procedures/login.ts`)
  - [x] Accepts: `vaultId`, `loginKey`, `deviceId`, `clientDeviceDescription`
  - [x] Verifies login key against stored hash
  - [x] Creates device session with hashed token
  - [x] Returns: session token + expiration + isNewDevice

#### Sync API ✅ COMPLETED

- [x] `createSecretUpdate` procedure
      (`api-server/src/procedures/create-secret-update.ts`)
  - [x] Session-authenticated (X-Vault-Session-Token header)
  - [x] Accepts: `vaultId`, `secretId`, `encryptedBlob`
  - [x] Server generates order numbers (globalOrder, localOrder)
  - [x] Returns: id, globalOrder, localOrder, createdAt

- [x] `getSecretUpdates` procedure
      (`api-server/src/procedures/get-secret-updates.ts`)
  - [x] Session-authenticated
  - [x] Accepts: `vaultId`, `sinceGlobalOrder`, `limit`
  - [x] Returns: updates array + hasMore flag for pagination

#### Client Sync Service ✅ COMPLETED

- [x] `sync-service.ts` in tauri-ts
  - [x] Track last synced global order per vault (`vault-sync-state.ts`)
  - [x] Background sync loop (every 5 seconds)
  - [x] Session expiration detection
  - [x] Exponential backoff on server errors
  - [x] `syncVault()` pulls and decrypts server changes
  - [x] `pushSecretUpdate()` encrypts and sends to server
  - [x] `triggerManualSync()` for immediate sync after edits

#### Deploy to AWS 🚧 IN PROGRESS

- [x] Push the latest schema to the PlanetScale prod database
- [x] Configure production database with dotenvx
  - [x] Set up `DATABASE_URL` and other secrets via dotenvx
  - [x] Attach environment variables to ECS Fargate service
  - [x] Verify database connectivity from production container
- [x] Deploy latest webapp to production
  - [x] Build and push Docker image to ECR
  - [x] Deploy to ECS Fargate with no errors
  - [x] Verify webapp loads at keypears.com
- [ ] Test dev app → production server sync
  - [ ] Configure dev Tauri app to connect to production API
  - [ ] Create vault on dev app, verify it syncs to production database
  - [ ] Create/edit secrets on dev app, verify sync works

#### Sync UI Indicators 🚧 PARTIAL

- [x] `ServerStatusBanner.tsx` shows online/offline/validating status
- [x] Sync state tracking (`lastSyncSuccess`, `syncError` in vault-sync-state)
- [ ] Add visible sync status icons to vault UI
  - [ ] ☁️ "Synced" - Last sync < 1 minute ago
  - [ ] 🔄 "Syncing..." - Sync in progress
  - [ ] ⚠️ "Sync error" - Last sync failed
  - [ ] 📶 "Offline" - No network connection, changes queued
- [ ] Show last sync timestamp in UI
- [ ] Add manual "Sync Now" button in UI

#### Testing & Validation

- [ ] Test cross-device sync (create secret on Device A, appears on Device B)
- [ ] Test offline mode (queue changes, sync when reconnected)
- [ ] Test conflict resolution (edit same secret on two devices, last write
      wins)
- [ ] Test sync performance (5 second polling interval)

---

## Phase 2: Diffie-Hellman Key Exchange

**Status**: ⏳ **PLANNED** - Not started

**Goal**: Users can securely share secrets with any other vault address.

### DH Key Generation

- [ ] Generate DH keypair on vault creation (client-side)
- [ ] Store DH private key encrypted with master vault key
- [ ] Store DH public key in vault metadata

### DH API

- [ ] Implement `registerPublicKey` procedure (server)
- [ ] Implement `getPublicKey` procedure (server)
- [ ] Implement `sendSecret` procedure (server)
- [ ] Implement `receiveSecrets` procedure (server)

### Cross-Domain Key Discovery

- [ ] Implement domain discovery (fetch public key from different domains)
- [ ] Add error handling for unreachable domains
- [ ] Cache public keys for performance

### Client DH Service

- [ ] Implement DH shared secret calculation
- [ ] Encrypt secrets with shared DH key before sending
- [ ] Decrypt received secrets with shared DH key
- [ ] Validate sender identity

### Sharing UI

- [ ] Add "Share Secret" button to password detail page
- [ ] Create share modal with recipient input (`bob@domain.com`)
- [ ] Implement inbox for received secrets
- [ ] Add accept/reject flow for received secrets

### Testing

- [ ] Test same-domain sharing (alice@keypears.com → bob@keypears.com)
- [ ] Test cross-domain sharing (alice@keypears.com → bob@wokerium.com)
- [ ] Test secret acceptance and rejection
- [ ] Test encrypted transmission (verify zero-knowledge)

---

## Phase 3: Multi-Domain Support

**Status**: ⏳ **PLANNED** - Not started

**Goal**: Support multiple official domains with open protocol for self-hosting.

### Official Domains

- [ ] Register and configure wokerium.com domain
- [ ] Register and configure hevybags.com domain
- [ ] Deploy KeyPears server to all three domains
- [ ] Configure DNS and SSL for all domains

### Domain Discovery UI

- [ ] Add domain dropdown to vault creation (keypears.com, wokerium.com,
      hevybags.com)
- [ ] Add "Custom domain" option with validation
- [ ] Implement connectivity check for custom domains
- [ ] Show domain status indicators

### Protocol Compatibility

- [ ] Ensure all servers implement identical orpc API
- [ ] Add protocol version negotiation
- [ ] Test federated sync across domains

### Self-Hosting Documentation

- [ ] Write deployment guide for self-hosted servers
- [ ] Document required environment variables
- [ ] Create Docker Compose example
- [ ] Document `.well-known/keypears.json` protocol

---

## Phase 4: Payment & Business Model

**Status**: ⏳ **PLANNED** - Not started

**Goal**: Enable revenue generation through freemium model with usage-based
limits.

### Free Tier Enforcement

- [ ] Add usage tracking tables to PostgreSQL
  - [ ] `vault_usage`: sync count, share count, secret count, storage bytes
  - [ ] Monthly reset mechanism
- [ ] Track sync operations per vault (300/month limit)
- [ ] Track secret shares per vault (50/month limit)
- [ ] Track secret count per vault (500 maximum)
- [ ] Track storage usage per vault (1GB limit)
- [ ] Return usage stats with each API response
- [ ] Block operations when limits exceeded

### Premium Tier Database

- [ ] Add `premiumTier` field to vault table (free/premium)
- [ ] Add `stripeCustomerId` field to vault table
- [ ] Add `premiumExpiresAt` timestamp

### Stripe Integration

- [ ] Create Stripe account
- [ ] Set up $99/year subscription product
- [ ] Implement Stripe Checkout integration
- [ ] Implement Stripe Customer Portal integration
- [ ] Set up webhook endpoint for subscription events
- [ ] Handle webhook events: `customer.subscription.created`,
      `customer.subscription.deleted`, `customer.subscription.updated`
- [ ] Test payment flow end-to-end

### Usage Tracking API

- [ ] Implement `getUsageStats` procedure
- [ ] Implement `checkTierLimits` procedure (validate before operations)
- [ ] Add usage stats to sync responses

### Payment UI

- [ ] Add usage meters to vault dashboard ("150/300 syncs this month")
- [ ] Show upgrade prompts when approaching limits (80% warning)
- [ ] Block operations at 100% with upgrade modal
- [ ] Add "Upgrade to Premium" button
- [ ] Show premium badge for premium users
- [ ] Add settings page with "Manage Subscription" link to Stripe portal

### Custom Domain Support (Premium Only)

- [ ] Implement `.well-known/keypears.json` protocol
- [ ] Add custom domain validation
- [ ] Restrict custom domains to premium users
- [ ] Test custom domain connectivity

### Testing

- [ ] Test free tier limits (hit 300 syncs, verify block)
- [ ] Test upgrade flow (Stripe Checkout → payment → premium activation)
- [ ] Test webhook processing (subscription changes reflected in real-time)
- [ ] Test premium features (unlimited usage, custom domain)
- [ ] Test subscription management (cancel, reactivate via Stripe portal)

---

## Platform Support

**Status**: ⏳ **PLANNED** - Desktop working, mobile not tested

### Desktop Apps (Tauri)

- [ ] Windows build and testing
- [ ] macOS build and testing
- [ ] Linux build and testing

### Mobile Apps (Tauri)

- [ ] Android build configuration
- [ ] Android testing (emulator + physical device)
- [ ] iOS build configuration
- [ ] iOS testing (simulator + physical device)
- [ ] Mobile-specific UI adjustments (touch targets, keyboard handling)

---

## Security Validation

**Status**: ⏳ **PLANNED** - Core crypto complete, validation needed

### Zero-Knowledge Architecture Verification

- [ ] Verify server never receives plaintext passwords
- [ ] Verify server never receives plaintext secrets
- [ ] Verify server never receives master vault keys (only encrypted)
- [ ] Verify server never receives password keys
- [ ] Verify server never receives encryption keys
- [ ] Verify login key cannot derive encryption key (computational analysis)

### Cryptography Audit

- [ ] Review Blake3 PBKDF implementation (100k rounds sufficient?)
- [ ] Review ACB3 encryption implementation
- [ ] Review key derivation separation (encryption vs login keys)
- [ ] Review DH key exchange implementation (Phase 2)

---

## MVP Completion Criteria

**All items below must be ✅ before MVP is complete:**

- [ ] ✅ User can create vault at `alice@keypears.com`
- [ ] ✅ User can create/edit/delete passwords on any device
- [ ] ✅ Changes sync to all devices within 30 seconds
- [ ] ✅ User can share password with `bob@keypears.com` via DH key exchange
- [ ] ✅ Bob receives, decrypts, and imports shared password
- [ ] ✅ All features work on Windows, macOS, Linux, Android, iOS
- [ ] ✅ Server supports keypears.com + wokerium.com + hevybags.com domains
- [ ] ✅ User can add custom domain server (with manual domain entry)
- [ ] ✅ Cross-domain sharing works (keypears.com ↔ wokerium.com)
- [ ] ✅ Zero-knowledge architecture verified (server cannot decrypt secrets)
- [ ] ✅ Free tier limits enforced (300 syncs, 50 shares, 500 secrets per month)
- [ ] ✅ User can purchase Premium tier ($99/year) via Stripe
- [ ] ✅ Premium users can add custom domain via `.well-known/keypears.json`
- [ ] ✅ Usage tracking works correctly (counters reset monthly, limits
      enforced)
- [ ] ✅ Stripe webhooks update premium status in real-time

---

**Last Updated**: 2025-12-02
