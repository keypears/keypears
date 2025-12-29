# KeyPears MVP TODO

This document tracks all tasks required to complete the KeyPears MVP. Tasks are
organized by MVP phase as defined in `docs/mvp.md`.

---

## Recently Completed

### Secure Channel Establishment with Sender Verification ✅

**Completed**: 2025-12-21

**Summary**: Implemented three-layer verification for secure channel
establishment between users across domains, preventing sender impersonation and
DoS attacks.

**What was implemented:**

- **PoW moved to key request**: PoW is now consumed when getting counterparty's
  engagement key, not when sending messages
- **Signature verification**: Sender signs PoW hash with engagement private key,
  proving they own the claimed pubkey
- **Cross-domain identity verification**: New `verifyEngagementKeyOwnership` API
  allows recipient's server to verify sender's pubkey belongs to their claimed
  address by calling sender's server
- **Channel binding**: PoW is tied to specific sender+recipient+pubkey,
  preventing replay attacks
- Updated client-side code (`new-message-dialog.tsx`, `compose-box.tsx`) with
  new flow: get key → derive privkey → get PoW → solve → sign → get counterparty
  key
- Updated `getPowChallenge` to accept sender/recipient addresses for difficulty
  resolution

**Security improvements:**

| Attack                           | Before      | After                                                |
| -------------------------------- | ----------- | ---------------------------------------------------- |
| Impersonate sender               | ❌ Possible | ✅ Prevented (signature + cross-domain verification) |
| DoS via key requests             | ❌ Free     | ✅ Requires PoW                                      |
| Replay PoW for different channel | N/A         | ✅ PoW tied to sender pubkey via signature           |

---

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
- Dynamic `.well-known/keypears.json` route in web-kp
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

#### Deploy to AWS ✅ COMPLETED

- [x] Push the latest schema to the PlanetScale prod database
- [x] Configure production database with dotenvx
  - [x] Set up `DATABASE_URL` and other secrets via dotenvx
  - [x] Attach environment variables to ECS Fargate service
  - [x] Verify database connectivity from production container
- [x] Deploy latest web-kp to production
  - [x] Build and push Docker image to ECR
  - [x] Deploy to ECS Fargate with no errors
  - [x] Verify web-kp loads at keypears.com
- [x] Test dev app → production server sync
  - [x] Configure dev Tauri app to connect to production API
  - [x] Create vault on dev app, verify it syncs to production database
  - [x] Create/edit secrets on dev app, verify sync works

#### Sync UI Indicators ✅ COMPLETED

- [x] `ServerStatusBanner.tsx` shows online/offline/validating status
- [x] Sync state tracking (`lastSyncSuccess`, `syncError` in vault-sync-state)
- [x] Add `isRead` column to track read/unread state of secret updates
- [x] Notification dot on user avatar when unread updates exist
- [x] "Sync Activity" menu item with unread count badge
- [x] Sync Activity page (`/vault/:vaultId/sync`) with:
  - [x] Sync status indicator (synced/error with relative timestamp)
  - [x] Manual "Sync Now" button
  - [x] Activity log with pagination
  - [x] Mark as read/unread per item
  - [x] Mark All Read button
- [x] Efficient rendering (only UserMenu re-renders on sync, not entire app)

#### Testing & Validation

- [x] Test cross-device sync (create secret on Device A, appears on Device B)
- [x] Test offline mode (queue changes, sync when reconnected)
- [x] Test conflict resolution (edit same secret on two devices, last write
      wins)
- [x] Test sync performance (5 second polling interval)

---

## Phase 2: Codebase Audit

**Status**: ✅ **COMPLETED**

**Goal**: Review entire codebase for clarity, maintainability, security,
scalability, and UI consistency.

**Timeline**: 1 day to 1 week

### Audit Checklist

For each file, verify:

- [x] **Clarity**: Understandable in 30 seconds, good naming, no unnecessary
      complexity
- [x] **Maintainability**: No duplication, no magic values, consistent error
      handling, explicit types
- [x] **Security**: Input validation, secrets handled safely, auth checked,
      crypto correct
- [x] **Scalability**: No N+1 queries, no unnecessary re-renders, no memory
      leaks
- [x] **UI**: Consistent styling, accessible, loading/error states, mobile
      responsive

### Package Audit Order

#### 1. @keypears/lib (lib/)

**Files to review:**

- src/index.ts
- src/crypto.ts
- src/domains.ts
- src/keypears-json.ts
- src/password-generator.ts
- All other source files
- package.json, tsconfig.json

**Audit checklist (see audit.md for details):**

- [x] 1.1 General Software Best Practices
- [x] 1.2 Third-Party Tools & Dependencies
- [x] 1.3 Security Assessment
- [x] 1.4 Scalability
- [x] 1.5 UI/UX Consistency
- [x] 1.6 File-Specific Checks

#### 2. @keypears/api-server (api-server/)

**Files to review:**

- src/index.ts, src/client.ts
- src/procedures/\*.ts
- src/db/index.ts, src/db/schema.ts
- src/db/models/\*.ts
- src/zod-schemas.ts
- package.json, tsconfig.json

**Audit checklist (see audit.md for details):**

- [x] 2.1 General Software Best Practices
- [x] 2.2 Third-Party Tools & Dependencies
- [x] 2.3 Security Assessment
- [x] 2.4 Scalability
- [x] 2.5 UI/UX Consistency
- [x] 2.6 File-Specific Checks

#### 3. @keypears/web-kp (web-kp/)

**Files to review:**

- server.ts
- app/routes/\*.tsx
- app/components/\*.tsx
- markdown/ content
- package.json, configs

**Audit checklist (see audit.md for details):**

- [x] 3.1 General Software Best Practices
- [x] 3.2 Third-Party Tools & Dependencies
- [x] 3.3 Security Assessment
- [x] 3.4 Scalability
- [x] 3.5 UI/UX Consistency
- [x] 3.6 File-Specific Checks

#### 4. @keypears/tauri-ts (tauri-ts/)

**Files to review:**

- app/routes/\*.tsx
- app/components/\*.tsx
- app/contexts/\*.tsx
- app/db/\*.ts
- app/lib/\*.ts
- package.json, vite.config.ts

**Audit checklist (see audit.md for details):**

- [x] 4.1 General Software Best Practices
- [x] 4.2 Third-Party Tools & Dependencies
- [x] 4.3 Security Assessment
- [x] 4.4 Scalability
- [x] 4.5 UI/UX Consistency
- [x] 4.6 File-Specific Checks

#### 5. @keypears/tauri-rs (tauri-rs/)

**Files to review:**

- src/lib.rs
- Cargo.toml, tauri.conf.json

**Audit checklist (see audit.md for details):**

- [x] 5.1 General Software Best Practices
- [x] 5.2 Third-Party Tools & Dependencies
- [x] 5.3 Security Assessment
- [x] 5.4 Scalability
- [x] 5.5 UI/UX Consistency
- [x] 5.6 File-Specific Checks

#### 6. Root Configs

**Files to review:**

- Dockerfile, docker-compose.yml
- package.json, pnpm-workspace.yaml
- Cargo.toml
- CLAUDE.md / AGENTS.md
- docs/\*.md

**Audit checklist (see audit.md for details):**

- [x] 6.1 General Software Best Practices
- [x] 6.2 Third-Party Tools & Dependencies
- [x] 6.3 Security Assessment
- [x] 6.4 Scalability
- [x] 6.5 UI/UX Consistency
- [x] 6.6 File-Specific Checks

---

## Phase 3: Key Derivation System

**Status**: ✅ **COMPLETED**

**Goal**: Enable server-side public key generation for offline users while
maintaining zero-knowledge of private keys.

**Details**: See [docs/engagement-keys.md](docs/engagement-keys.md) for full
implementation plan.

### Overview

The key derivation system enables:

1. **Offline key generation**: Server generates public keys while user is
   offline
2. **User-only private keys**: Only the vault owner can derive private keys
3. **Per-key isolation**: Each engagement key uses fresh entropy

Uses elliptic curve addition property: `(a + b) * G = A + B`

### Implementation Summary

- [x] **@keypears/lib**: Export `privateKeyAdd`, `publicKeyAdd` from secp256k1
- [x] **@keypears/api-server schema**: Add `vaultPubKey` to vault table, create
      `engagement_key` table
- [x] **@keypears/api-server procedures**: `createEngagementKey`,
      `getEngagementKeys`, `getDerivationPrivKey`
- [x] **@keypears/tauri-ts**: Update vault creation to send `vaultPubKey`
- [x] **@keypears/tauri-ts**: Create Keys page route with key list and private
      key derivation UI
- [x] **Database migration**: Push schema changes

---

## Phase 4: Proof-of-Work for New User Registrations

**Status**: ✅ **COMPLETED**

**Goal**: Require proof-of-work for new vault registrations to prevent
spam/sybil attacks.

**Details**: See [docs/pow.md](docs/pow.md) for full algorithm documentation.

### PoW Algorithm Foundation ✅ COMPLETED

- [x] Migrate pow5 algorithm from earthbucks to keypears
- [x] Create pow5-64b variant (64-byte format: 32-byte nonce + 32-byte
      challenge)
- [x] Remove pow5-217a variant (simplified to single algorithm)
- [x] WGSL shader for GPU mining (`pow5-ts/src/pow5-64b.wgsl`)
- [x] TypeScript WGSL wrapper (`pow5-ts/src/pow5-64b-wgsl.ts`)
- [x] Rust WASM implementation (`pow5-rs/src/lib.rs` with `_64b` functions)
- [x] TypeScript WASM wrapper (`pow5-ts/src/pow5-64b-wasm.ts`)
- [x] Cross-implementation tests (WGSL and WASM produce identical results)
- [x] Documentation (`docs/pow.md`)

### PoW Test Integration ✅ COMPLETED

- [x] Create `getPowChallenge` procedure (server)
  - [x] Generate random 32-byte challenge
  - [x] Set difficulty target (hardcoded for testing)
  - [x] Return header (64 bytes: nonce + challenge) + target + difficulty
- [x] Create `verifyPowProof` procedure (server)
  - [x] Accept originalHeader + solvedHeader + hash
  - [x] Verify challenge bytes match (bytes 32-63)
  - [x] Recompute hash using WASM and verify match
  - [x] Verify hash < target
- [x] Create test page in tauri-ts (`/test-pow`)
  - [x] UI to request challenge from server
  - [x] GPU mining using WGSL with WASM fallback
  - [x] Display implementation used (WGSL/WASM)
  - [x] Submit proof and show verification result
  - [x] Accessible from burger menu ("Test PoW")

### New User Registration Integration

- [x] Update `registerVault` procedure to require proof-of-work
  - [x] Accept additional fields: `challengeId`, `solvedHeader`, `hash`
  - [x] Verify proof before creating vault
  - [x] Atomic challenge consumption (prevents replay attacks)
- [x] Update tauri-ts vault creation wizard
  - [x] Add PoW step after name/password
  - [x] Show mining progress UI
  - [x] Handle WebGPU fallback to WASM

---

## Phase 5: DH-Based Messaging System

**Status**: ✅ **COMPLETED**

**Goal**: Enable end-to-end encrypted messaging between any two addresses using
Diffie-Hellman key exchange.

**Details**: See [docs/messages.md](docs/messages.md) for full protocol
specification.

### Server-Side Foundation ✅ COMPLETED

#### Database Schema ✅ COMPLETED

- [x] Add `channel_view` table (each participant's view of a channel)
  - [x] `id`, `ownerAddress`, `counterpartyAddress`
  - [x] `status` ("pending" | "saved" | "ignored") - "saved" means in vault
  - [x] `minDifficulty` (per-channel PoW override, nullable = use global)
  - [x] `createdAt`, `updatedAt`
  - [x] Note: NO public keys or role - channels are between addresses, keys go
        in messages
- [x] Add `inbox_message` table (messages I received)
  - [x] `id`, `channelViewId`, `senderAddress`, `orderInChannel`
  - [x] `encryptedContent`
  - [x] `senderEngagementPubKey`, `recipientEngagementPubKey` (both needed for
        decryption)
  - [x] `powChallengeId` (proves sender did work for this message)
  - [x] `isRead`, `createdAt`, `expiresAt`
  - [x] Note: NO outbox table - sent messages saved to sender's vault via
        secret_update
- [x] Update `engagement_key` table
  - [x] Add `purpose` field ("send" | "receive" | "manual")
  - [x] Add `counterpartyPubKey` field (other party's pubkey, for validation)
- [x] Create Drizzle models (`channel.ts`, `inbox-message.ts`)
  - [x] Channel model with CRUD operations, status updates, pagination
  - [x] Inbox message model with auto-incrementing orderInChannel, read tracking
  - [x] Unit tests for both models

#### API Procedures ✅ COMPLETED

- [x] `getEngagementKeyForSending` - Create engagement key for sending (purpose:
      "send")
- [x] `getCounterpartyEngagementKey` - Public endpoint; accepts sender's pubkey,
      creates key with purpose "receive", stores sender's pubkey for later
      validation
- [x] `sendMessage` - Send message with PoW proof; validates engagement key
      metadata (purpose, counterpartyAddress, counterpartyPubKey) before
      accepting
- [x] `getChannels` - List channels for an address (with pagination)
- [x] `getChannelMessages` - Get messages in a channel (reverse chronological
      order)
- [x] `updateChannelStatus` - Accept/ignore channel

#### Zod Schemas ✅ COMPLETED

- [x] Add request/response schemas for all messaging procedures
- [x] `ChannelStatusSchema` - Enum for channel status (pending/saved/ignored)
- [x] `GetEngagementKeyForSendingRequestSchema` / `ResponseSchema`
- [x] `GetCounterpartyEngagementKeyRequestSchema` / `ResponseSchema`
- [x] `SendMessageRequestSchema` / `ResponseSchema`
- [x] `GetChannelsRequestSchema` / `ResponseSchema`
- [x] `GetChannelMessagesRequestSchema` / `ResponseSchema`
- [x] `UpdateChannelStatusRequestSchema` / `ResponseSchema`

#### Integration Test Setup ✅ COMPLETED

- [x] Refactor test/server.ts to export `createTestServer()` function
- [x] Create test/global-setup.ts for vitest globalSetup
- [x] Update vitest.config.ts with globalSetup option
- [x] Single `pnpm test` command now runs all tests automatically

### Client-Side Encryption ✅ COMPLETED

- [x] Add ECDH shared secret computation to `@keypears/lib` (`ecdhSharedSecret`)
- [x] Create `message-encryption.ts` in tauri-ts
  - [x] `encryptMessage(content, myPrivKey, theirPubKey)` → encrypted string
  - [x] `decryptMessage(encrypted, myPrivKey, theirPubKey)` → MessageContent
  - [x] `createTextMessage(text)` → MessageContent helper

### Client UI Implementation ✅ COMPLETED

#### Channel List (`vault.$vaultId.messages._index.tsx`) ✅

- [x] Replace "Coming Soon" placeholder
- [x] List channels sorted by last activity (updatedAt DESC)
- [x] Show counterparty address, message count, timestamp
- [x] Status indicator (Saved/Pending/Ignored)
- [x] "New Message" button opens dialog

#### Channel Detail (`vault.$vaultId.messages.$channelId.tsx`) ✅

- [x] Message thread (chronological order)
- [x] Compose box at bottom with PoW mining
- [x] Channel header with counterparty info
- [x] Status toggle buttons (Save/Pending/Ignore)
- [x] Auto-save on reply (replying to pending/ignored channel saves it)
- [x] Dual data source: saved channels query vault, pending/ignored query inbox

#### New Message Flow (`new-message-dialog.tsx`) ✅

- [x] Input: counterparty address (e.g., `alice@example.com`)
- [x] Resolve address → fetch engagement key (cross-domain via well-known)
- [x] PoW mining step (WebGPU with WASM fallback)
- [x] Compose first message
- [x] Send → creates channel with status "saved" for sender
- [x] Save sent message to vault immediately after sending

### Vault Integration ✅ COMPLETED

- [x] Messages page queries server API for channels (pending/ignored) or local
      vault (saved)
- [x] Passwords page filters out `type: "message"` from secrets
- [x] Auto-sync: `syncInboxMessages()` moves inbox messages to vault for saved
      channels
- [x] Server-generated `secretId` in `channel_view` ensures consistency across
      devices
- [x] `getSenderChannel` API creates sender's channel_view with status "saved"
- [x] `getInboxMessagesForSync` / `deleteInboxMessages` APIs for sync process
- [x] Sent messages saved to vault immediately after sending

### Federation (Cross-Domain) ✅ COMPLETED

- [x] `getCounterpartyEngagementKey` calls counterparty's server
- [x] Use `.well-known/keypears.json` for API URL resolution
- [x] `createClientFromDomain()` handles cross-domain client creation
- [x] Error handling for network failures

### Testing

- [x] Unit tests: channel and inbox-message models
- [x] Integration tests: API procedures with vitest globalSetup
- [x] Manual: same-domain messaging (alice@keypears.com → bob@keypears.com)
- [x] Manual: cross-domain messaging (alice@keypears.com → bob@passapples.com)
- [ ] Manual: verify sent messages appear on all sender's devices
- [ ] Manual: verify saved channel messages sync across recipient's devices
- [ ] Manual: verify auto-save on reply works correctly
- [ ] Manual: verify inbox messages deleted after sync to vault

---

## Phase 5: Multi-Domain Support

**Status**: ⏳ **PLANNED** - Not started

**Goal**: Support multiple official domains with open protocol for self-hosting.

### Official Domains

- [ ] Register and configure passapples.com domain
- [ ] Register and configure lockberries.com domain
- [ ] Deploy KeyPears server to all three domains
- [ ] Configure DNS and SSL for all domains

### Domain Discovery UI

- [ ] Add domain dropdown to vault creation (keypears.com, passapples.com,
      lockberries.com)
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

## Phase 6: Payment & Business Model

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
- [ ] ✅ Server supports keypears.com + passapples.com + lockberries.com domains
- [ ] ✅ User can add custom domain server (with manual domain entry)
- [ ] ✅ Cross-domain sharing works (keypears.com ↔ passapples.com)
- [ ] ✅ Zero-knowledge architecture verified (server cannot decrypt secrets)
- [ ] ✅ Free tier limits enforced (300 syncs, 50 shares, 500 secrets per month)
- [ ] ✅ User can purchase Premium tier ($99/year) via Stripe
- [ ] ✅ Premium users can add custom domain via `.well-known/keypears.json`
- [ ] ✅ Usage tracking works correctly (counters reset monthly, limits
      enforced)
- [ ] ✅ Stripe webhooks update premium status in real-time

---

**Last Updated**: 2025-12-29
