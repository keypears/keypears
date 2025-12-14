# Authentication System

This document describes the KeyPears authentication and authorization system,
including current implementation, identified issues, and the proposed
session-based authentication architecture.

---

## Current Authentication System (Analysis)

### How Login Key is Currently Used

**Current flow:**

1. Client derives `loginKey` from password + vaultId (vault-specific MAC +
   100k + 100k rounds KDF)
2. Server KDFs the login key with vaultId salting (vault-specific MAC + 1k
   rounds) → `hashedLoginKey` for storage
3. Client sends `loginKey` in `X-Vault-Login-Key` header for **every**
   authenticated request
4. Server validates by re-deriving with vaultId and comparing against stored
   `hashedLoginKey`

**Current API endpoints:**

| Endpoint                | Auth Required | Current Protection                                  |
| ----------------------- | ------------- | --------------------------------------------------- |
| `blake3`                | ❌ No         | Public utility endpoint                             |
| `checkNameAvailability` | ❌ No         | Public endpoint (needed for registration)           |
| `registerVault`         | ❌ No         | Public endpoint (vault creation)                    |
| `getVaultInfoPublic`    | ❌ No         | Public endpoint (returns vaultId for import flow)   |
| `getVaultInfo`          | ✅ Yes        | Uses `vaultAuthedProcedure` + `validateVaultAuth()` |
| `createSecretUpdate`    | ✅ Yes        | Uses `vaultAuthedProcedure` + `validateVaultAuth()` |
| `getSecretUpdates`      | ✅ Yes        | Uses `vaultAuthedProcedure` + `validateVaultAuth()` |

### Current Auth Implementation

**Base procedures** (`api-server/src/procedures/base.ts`):

- `base` - No auth required
- `vaultAuthedProcedure` - Requires `X-Vault-Login-Key` header
- `validateVaultAuth(loginKey, vaultId)` - Validates login key matches vault

**Process:**

```typescript
// 1. Middleware extracts login key from header
const loginKeyHeader = context.headers["x-vault-login-key"];

// 2. vaultAuthedProcedure checks header is present
if (!context.loginKey) {
  throw new ORPCError("UNAUTHORIZED", "Missing X-Vault-Login-Key header");
}

// 3. Handler calls validateVaultAuth() to verify login key
await validateVaultAuth(context.loginKey, vaultId);

// Inside validateVaultAuth():
// - Query vault by vaultId
// - Derive hashedLoginKey from provided loginKey + vaultId (vault-specific MAC + 1k rounds)
// - Compare with stored hashedLoginKey
// - Throw UNAUTHORIZED if mismatch
```

---

## Problems with Current System

### 1. **No Device Tracking**

- Every device using the same vault looks identical to the server
- Cannot distinguish between authorized devices
- Cannot alert user when new device accesses vault
- Cannot revoke access for compromised/lost devices

### 2. **No Session Management**

- Login key is sent with every single API request
- Increases exposure window (more chances to intercept)
- No concept of "logging out" - key is valid forever until password changes
- Cannot track active sessions per device

### 3. **Cannot Support MFA/2FA**

- No way to verify device identity during authentication
- Cannot prompt for second factor on new devices
- Cannot differentiate trusted vs untrusted devices

### 4. **Poor Security Model**

- If login key is intercepted once, attacker has permanent access
- No time-limited credentials
- No ability to audit which device made which change
- Cannot implement rate limiting per device

### 5. **Sync Service Holds Login Key Forever**

- Background sync stores `loginKey` in memory indefinitely
- Increases attack surface (memory dump could expose key)
- No automatic credential rotation

---

## Proposed Session-Based Authentication System

### Goals

1. **Device Identity**: Each device gets unique device ID for tracking
2. **Session Tokens**: Time-limited tokens for API access (not login key)
3. **Auditability**: Track which device made which changes
4. **Security**: Login key only used during authentication, not for every
   request
5. **Future-Ready**: Foundation for MFA/2FA and device trust management
6. **In-Memory Only**: Session tokens stored in memory, never persisted to disk

---

## New Authentication Architecture

### Key Concepts

**Login Key**:

- Used ONLY for authentication (getting session token)
- Never sent with regular API requests
- Derived from password + vaultId via vault-specific MAC + 100k + 100k rounds
  KDF
- VaultId is hashed with password client-side before PBKDF (prevents rainbow
  table attacks)
- Proves user knows the password and vault ID

**Device ID**:

- Unique identifier **per vault per device** (privacy-focused)
- Generated once per vault, stored in client SQLite database
- Format: UUIDv7 in Crockford Base32 (26 characters, time-ordered)
- Different device IDs for same physical device across different vaults/domains
- Prevents cross-domain device tracking by servers
- Used to track and manage device access

**Session Token**:

- Time-limited credential for API access
- Generated by server after successful login key validation
- Client stores raw token in memory only (never disk)
- Server stores Blake3 hash of token (not raw token)
- Automatically renewed before expiration
- Format: Cryptographically secure random 32-byte value (hex = 64 chars)
- Security: Database breach does not expose usable session tokens

---

## Database Schema Changes

### Client-Side: New Columns in `vault` Table

Add to existing `TableVault` in `tauri-ts/app/db/schema.ts`:

```typescript
export const TableVault = sqliteTable(
  "vault",
  {
    // ... existing fields (id, name, domain, encryptedVaultKey, etc.) ...

    // Device ID for this vault (generated once per vault, never changes)
    deviceId: text("device_id").notNull(), // UUIDv7, generated on vault creation/import

    // Auto-detected device description for UI display
    deviceDescription: text("device_description"), // e.g., "macOS 14.1" or "iPhone (iOS 17.2)"
  },
  // ... existing indexes ...
);
```

**Privacy-focused design:**

- Device ID is **per-vault**, not global across all vaults
- Same physical device gets different device IDs for different vaults/domains
- Prevents cross-domain/cross-vault device correlation by servers
- Generated using UUIDv7 on vault creation or import
- Stored locally in SQLite database
- Never shared except with that specific vault's server

**Device description detection:**

```typescript
import { platform, version, arch } from '@tauri-apps/plugin-os';

// Auto-detect device description
function detectDeviceDescription(): string {
  const platformName = platform(); // "macos", "windows", "linux", "ios", "android"
  const osVersion = version(); // "14.1", "11", "17.2", etc.
  const architecture = arch(); // "x86_64", "aarch64", etc.

  // Format examples:
  // - "macOS 14.1 (aarch64)" - MacBook with Apple Silicon
  // - "Windows 11 (x86_64)" - Windows PC
  // - "iPhone (iOS 17.2)" - iPhone
  // - "Android 14" - Android device
  // - "Linux (x86_64)" - Linux desktop

  if (platformName === "ios") {
    return `iPhone (iOS ${osVersion})`;
  } else if (platformName === "android") {
    return `Android ${osVersion}`;
  } else if (platformName === "macos") {
    return `macOS ${osVersion} (${architecture})`;
  } else if (platformName === "windows") {
    return `Windows ${osVersion} (${architecture})`;
  } else if (platformName === "linux") {
    return `Linux ${osVersion} (${architecture})`;
  } else {
    return `${platformName} ${osVersion}`;
  }
}
```

### Server-Side: New Table `device_session`

```typescript
export const TableDeviceSession = pgTable(
  'device_session',
  {
    // Primary key - UUIDv7
    id: varchar('id', { length: 26 }).primaryKey(),

    // Foreign key to vault
    vaultId: varchar('vault_id', { length: 26 })
      .notNull()
      .references(() => TableVault.id, { onDelete: 'cascade' }),

    // Device identifier (client-generated UUIDv7, unique per vault per device)
    deviceId: varchar('device_id', { length: 26 }).notNull(),

    // Device metadata for user-facing identification
    // Auto-detected by client, sent during login (read-only)
    clientDeviceDescription: varchar('client_device_description', { length: 100 }), // e.g., "macOS 14.1 (aarch64)"

    // User-editable device name (set by vault owner via UI)
    serverDeviceName: varchar('server_device_name', { length: 100 }), // e.g., "Ryan's MacBook Pro"

    // Hashed session token (SHA-256 hash of 32-byte random token)
    // Server NEVER stores raw session token - only SHA-256 hash
    // Client sends raw token, server hashes and compares
    hashedSessionToken: varchar('hashed_session_token', { length: 64 }).notNull(), // SHA-256 hex = 64 chars

    // Session expiration (Unix milliseconds)
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),

    // Last activity timestamp for session management
    lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),

    // Tracking
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ([
    // Index for looking up active sessions by vault + device
    index('idx_vault_device').on(table.vaultId, table.deviceId),

    // Index for token lookup (used on every authenticated request)
    index('idx_session_token').on(table.sessionToken),

    // Unique: one active session per vault + device combination
    unique().on(table.vaultId, table.deviceId),
  ]),
);
```

**Design decisions:**

- One active session per vault+device (re-authentication replaces old session)
- **Hashed session tokens**: Server stores SHA-256 hash, not raw token
  - Client sends raw 32-byte session token in header
  - Server hashes incoming token and compares with stored hash
  - Database breach does not expose usable session tokens
  - Same security pattern as login key (raw → hash → compare)
- Session token hashes are indexed for fast lookup on every request
- `clientDeviceDescription`: Auto-detected from client, read-only (e.g., "macOS
  14.1 (aarch64)")
- `serverDeviceName`: User-editable label for this device (e.g., "Work Laptop",
  "Home iPhone")
- Combined display in UI: "Work Laptop (macOS 14.1)" = serverDeviceName +
  clientDeviceDescription
- Device metadata helps users identify and manage devices
- `lastActivityAt` enables idle session timeout
- Cascade delete when vault is deleted
- Privacy: Each vault tracks devices independently (no cross-vault correlation)

---

## Authentication Flow

### 1. Device ID Generation (Per Vault)

**When creating a new vault:**

```typescript
import { uuidv7 } from "@keypears/lib";
import { platform, version, arch } from '@tauri-apps/plugin-os';

// Generate NEW device ID for this vault
const deviceId = uuidv7(); // Fresh UUIDv7 for this specific vault

// Auto-detect device description
const deviceDescription = detectDeviceDescription(); // e.g., "macOS 14.1 (aarch64)"

// Store in vault record
await db.insert(TableVault).values({
  id: vaultId,
  name,
  domain,
  encryptedVaultKey,
  vaultPubKeyHash,
  deviceId,              // NEW: Per-vault device ID
  deviceDescription,      // NEW: Auto-detected OS info
  // ... other fields ...
});
```

**When importing an existing vault:**

```typescript
// Generate NEW device ID for this imported vault (privacy!)
const deviceId = uuidv7(); // Different from vault's ID on other devices

// Auto-detect device description for THIS device
const deviceDescription = detectDeviceDescription();

// Store in vault record
await db.insert(TableVault).values({
  id: importedVaultId,    // From server
  name: importedName,     // From server
  domain: importedDomain, // From server
  encryptedVaultKey,      // From server
  vaultPubKeyHash,        // From server
  deviceId,               // NEW: Unique to this device+vault combination
  deviceDescription,      // NEW: Auto-detected for this device
  // ... other fields ...
});
```

**Privacy guarantee:**

- Same physical MacBook accessing `alice@keypears.com` and `bob@hevybags.com`
  will have:
  - Different device IDs for each vault
  - Same device description ("macOS 14.1 (aarch64)") - not sensitive
  - No way for servers to correlate that it's the same physical device

### 2. Login / Session Creation

**New API endpoint:** `POST /api/login`

**Request:**

```typescript
{
  vaultId: string,                    // Which vault to authenticate to (from client SQLite DB)
  loginKey: string,                   // 64-char hex (proves password + vaultId knowledge)
  deviceId: string,                   // 26-char UUIDv7 (per-vault device identifier from client DB)
  clientDeviceDescription?: string,   // Optional: "macOS 14.1 (aarch64)" - auto-detected
}
```

**Important:** Client must have vaultId before calling login:

- On vault creation: Generated client-side with `uuidv7()`
- On vault import: Retrieved via `getVaultInfoPublic()` endpoint
- On unlock: Read from local SQLite vault table

**Server process:**

1. Validate `loginKey` against vault's stored `hashedLoginKey` (using vaultId
   for salting)
2. Check if device is recognized (exists in `device_session` table for this
   vault+device)
3. Generate new session token (32 random bytes)
4. **Hash the session token** using SHA-256 for database storage
5. Set expiration time (e.g., 24 hours from now)
6. Upsert session record:
   - If device exists: Update hashedSessionToken, expiresAt, lastActivityAt, and
     clientDeviceDescription
   - If new device: Insert new record with null serverDeviceName (user can set
     later)
7. Return **raw session token** (not hash) and whether device is new

**Important:** Server generates raw token, hashes it for storage, returns raw
token to client

**Response:**

```typescript
{
  sessionToken: string,      // 64-char hex
  expiresAt: number,         // Unix milliseconds
  isNewDevice: boolean,      // true if first time seeing this deviceId
}
```

**Client action:**

- Store `sessionToken` in memory only (not disk)
- Store `expiresAt` for renewal logic
- If `isNewDevice: true`, show user notification (future feature)

### 3. Authenticated API Requests

**All authenticated endpoints change from:**

```
X-Vault-Login-Key: <loginKey>
```

**To:**

```
X-Vault-Session-Token: <sessionToken>
```

**Server middleware:**

```typescript
import { sha256Hash } from "@webbuf/sha256";
import { WebBuf } from "@webbuf/webbuf";

// Extract raw session token from header
const rawSessionToken = context.headers["x-vault-session-token"];

if (!rawSessionToken) {
  throw new ORPCError("UNAUTHORIZED", "Missing session token");
}

// Hash the incoming token to compare with database
const sessionTokenBuf = WebBuf.fromHex(rawSessionToken);
const hashedSessionToken = sha256Hash(sessionTokenBuf).buf.toHex();

// Query device_session table using HASHED token
const session = await db
  .select()
  .from(TableDeviceSession)
  .where(eq(TableDeviceSession.hashedSessionToken, hashedSessionToken))
  .limit(1);

if (!session[0]) {
  throw new ORPCError("UNAUTHORIZED", "Invalid or expired session");
}

// Check expiration
if (Date.now() > session[0].expiresAt) {
  await db.delete(TableDeviceSession)
    .where(eq(TableDeviceSession.id, session[0].id));
  throw new ORPCError("UNAUTHORIZED", "Session expired");
}

// Update last activity
await db.update(TableDeviceSession)
  .set({ lastActivityAt: new Date() })
  .where(eq(TableDeviceSession.id, session[0].id));

// Pass session context to handler
return next({
  context: {
    ...context,
    session: session[0],
    vaultId: session[0].vaultId,
    deviceId: session[0].deviceId,
  },
});
```

**Security flow:**

1. Client sends raw session token in `X-Vault-Session-Token` header
2. Server hashes incoming token using SHA-256
3. Server queries database for matching hashed token
4. Database never contains raw session tokens
5. Token theft from database is useless without rainbow tables (infeasible for
   32-byte random values)

### 4. Session Renewal

**Strategy:** Automatic renewal before expiration

**Client logic:**

```typescript
// Check if session expires in < 1 hour
if (sessionExpiresAt - Date.now() < 60 * 60 * 1000) {
  // Renew session using login key
  const loginKey = getLoginKey(); // From memory (unlocked vault context)
  const newSession = await client.api.login({
    vaultId,
    loginKey: loginKey.buf.toHex(),
    deviceId,
  });

  // Update in-memory session token
  updateSessionToken(newSession.sessionToken, newSession.expiresAt);
}
```

**When to renew:**

- Every 5 seconds, background sync checks if renewal needed
- Before any user-initiated action (create/edit secret)
- On app resume (mobile) or tab focus (web)

**Renewal is just a re-login:**

- Use existing `login` endpoint with same `deviceId`
- Server replaces old session token with new one
- No need for separate "refresh token" mechanism

### 5. Logout

**Client-initiated logout:**

```typescript
// Call logout endpoint with raw session token
await client.api.logout({ sessionToken });

// Clear from memory
clearSessionToken();

// Navigate to lock screen
navigate("/vault/:vaultId/lock");
```

**Server process:**

1. Receive raw session token from client
2. Hash the token using SHA-256
3. Query `device_session` table for matching hashed token
4. Delete session record from database
5. Return success

**Security note:** Server must hash incoming token to find matching record since
database only stores hashes

**Effect:**

- Session token immediately invalidated
- User must re-enter password to unlock vault
- Device ID remains (device is still "known")

---

## Security Properties

### What Changes

1. **Login key only used during authentication**
   - Sent once during login
   - Not sent with every API request
   - Reduces exposure window

2. **Session tokens are time-limited**
   - 24-hour expiration (configurable)
   - Automatic renewal for active users
   - Idle sessions expire naturally

3. **Device tracking enabled**
   - Each device has unique ID
   - Server knows which devices have accessed vault
   - Foundation for future device management UI

4. **Logout actually works**
   - Invalidates session token on server
   - No longer authenticated until re-login
   - Device remains registered for future logins

### What Doesn't Change

1. **No cookies or JWTs**
   - Simple bearer token in header
   - Client manages token in memory
   - No cookie security concerns

2. **No disk persistence of credentials**
   - Session token stored in memory only
   - Lost when app closes (same as current loginKey behavior)
   - Device ID stored in localStorage (not sensitive)

3. **Password verification still client-side**
   - Client derives keys from password + vaultId
   - VaultId required for key derivation (obtained from local DB or server)
   - Server only sees login key (not password)
   - Three-tier key derivation uses vault-specific salting

### Attack Surface Analysis

**Current system:**

- Login key sent with every request (100+ times per session)
- Intercepting any request gives permanent access
- No way to revoke access without changing password

**New system:**

- Login key sent once per 24 hours
- Intercepting session token gives 24-hour access (at most)
- **Database breach does not expose usable session tokens** (only hashes stored)
- Can revoke device access without changing password
- Can implement rate limiting per device
- Can detect suspicious device patterns

**Token storage security:**

| Token Type     | Client Storage | Server Storage                        | Database Breach Impact                                                                                             |
| -------------- | -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Login Key      | Memory only    | SHA-256 hash (vaultId MAC + 100k rounds) | Cannot use directly (needs vaultId + 100k rounds reversal + 100k rounds reversal + rainbow table for 32-byte random) |
| Session Token  | Memory only    | SHA-256 hash (single round)            | Cannot use directly (32-byte random, no rainbow table)                                                             |
| Encryption Key | Memory only    | Never sent to server                  | N/A - server never sees this                                                                                       |

**Why hashing session tokens matters:**

- Session tokens are 32-byte cryptographically random values
- Even with database access, attacker cannot use hashed tokens
- No practical rainbow table exists for 32-byte random values (2^256
  possibilities)
- Same security model as password hashing, but for bearer tokens
- Defense in depth: Even if database is compromised, active sessions remain
  secure

---

## Implementation Plan

### Phase 1: Database Schema ✅ COMPLETE

1. ✅ Create `device_session` table migration (`api-server/src/db/schema.ts`)
2. ✅ Add indexes for performance (vault+device, session token)
3. ✅ Test with sample data (10/10 unit tests passing in
   `device-session.test.ts`)

**Implementation notes:**

- Used Drizzle ORM with PostgreSQL
- Session tokens stored as SHA-256 hashes (64-char hex)
- Unique constraint on (vaultId, deviceId) ensures one session per device per
  vault
- Cascade delete when vault is deleted

### Phase 2: Server-Side Auth ✅ COMPLETE

1. ✅ Create `device-session` model in
   `api-server/src/db/models/device-session.ts`
2. ✅ Implement `login` procedure (`api-server/src/procedures/login.ts`)
3. ✅ Implement `logout` procedure (`api-server/src/procedures/logout.ts`)
4. ✅ Create new `sessionAuthedProcedure` middleware
   (`api-server/src/procedures/base.ts`)
5. ✅ Update all protected endpoints to use new middleware:
   - `getVaultInfo`
   - `createSecretUpdate`
   - `getSecretUpdates`

**Implementation notes:**

- Session tokens generated with `FixedBuf.fromRandom(32)` (cryptographically
  secure)
- Server stores only Blake3 hash of tokens (64-char hex)
- Session validation includes expiration checking and auto-deletion of expired
  sessions
- Fire-and-forget `lastActivityAt` updates to avoid blocking requests
- Router exports `login` and `logout` procedures with full type safety
- Comprehensive test suite (11 integration tests in `auth.test.ts`)
- All tests passing (lint, typecheck, test, build)

**API endpoints added:**

- `POST /api/login` - Creates session, returns raw token
  - Input: `{ vaultId, loginKey, deviceId, clientDeviceDescription? }`
  - Output: `{ sessionToken, expiresAt, isNewDevice }`
- `POST /api/logout` - Invalidates session
  - Input: `{ sessionToken }`
  - Output: `{ success: boolean }`

**Security implementation:**

- Session tokens: 32 bytes of cryptographic randomness → 64-char hex
- Server storage: Blake3 hash only (same pattern as login key hashing)
- Token validation: Server hashes incoming token and compares with stored hash
- Database breach protection: Raw session tokens never stored
- Session expiration: 24 hours (configurable via
  `Date.now() + 24 * 60 * 60 * 1000`)

### Phase 3: Client-Side Auth ✅ COMPLETE

1. ✅ Add device ID generation/storage logic (`tauri-ts/app/lib/device.ts`)
2. ✅ Update `api-client.ts` to use session tokens
3. ⏳ Implement session renewal logic (deferred to Phase 4)
4. ✅ Update vault unlock flow to call login endpoint
   (`unlock-vault.$vaultId.tsx`)
5. ✅ Update lock vault flow to call logout endpoint (`user-menu.tsx`)

**Implementation notes:**

- Added `deviceId` and `deviceDescription` fields to client vault table
- Device IDs are per-vault UUIDv7s (privacy-focused)
- Session tokens stored in memory only (React state in VaultContext)
- Background sync uses session token getter function
- Login flow: verify password → generate/get device ID → call /api/login → store
  session → unlock vault
- Logout flow: call /api/logout → clear session → lock vault → navigate home
- Migration: `0001_powerful_mantis.sql` adds device fields to vault table

### Phase 4: Migration ❌ NOT APPLICABLE

**Reason**: Pre-MVP with no deployed clients, so no migration needed.

1. ❌ Keep old `X-Vault-Login-Key` auth working - Unnecessary (no old clients
   exist)
2. ✅ Client automatically upgrades - Already done in Phase 3
3. ❌ Deprecation notice - Not needed (we control all clients)
4. ❌ Remove old auth after migration - No old auth to remove

**Conclusion**: Client was updated in Phase 3 to use session-based auth. Since
we're pre-MVP with zero users and control 100% of clients, there's nothing to
migrate.

### Phase 5: Audit Endpoints ✅ COMPLETE

**All 9 endpoints audited and verified correct auth:**

**Public Endpoints** (use `base` - no auth required):

- ✅ `blake3` - Public utility for hashing
- ✅ `checkNameAvailability` - Check if vault name is available
- ✅ `registerVault` - Create new vault (public, but validates input)
- ✅ `getVaultInfoPublic` - Get public vault metadata for import flow

**Login Endpoint** (uses `base` but validates login key in handler):

- ✅ `login` - Uses `base.handler()` with manual
  `validateVaultAuth(loginKey, vaultId)` call
  - Input: vaultId, loginKey, deviceId, clientDeviceDescription
  - Output: sessionToken, expiresAt, isNewDevice
  - Creates or updates device session

**Logout Endpoint** (uses `base` - accepts session token in input):

- ✅ `logout` - Uses `base.handler()`, receives session token in request body
  - Input: sessionToken
  - Output: success
  - Deletes device session by hashed token (idempotent)

**Protected Endpoints** (use `sessionAuthedProcedure` - requires session token
in header):

- ✅ `getVaultInfo` - Get vault metadata (authenticated)
- ✅ `createSecretUpdate` - Create new secret
- ✅ `getSecretUpdates` - Sync secrets from server

---

## Future Enhancements

### Device Management UI

Users can manage devices through vault settings:

**List devices:**

- Show all devices with active sessions for this vault
- Display: serverDeviceName (if set) or clientDeviceDescription
- Show last activity timestamp
- Indicate current device

**Edit device name:**

- User can set/update serverDeviceName for any device
- Examples: "Work Laptop", "Home iPhone", "Travel iPad"
- Helps identify devices when multiple have same clientDeviceDescription

**Revoke access:**

- Delete device session from server
- Device must re-authenticate with login key on next access
- Useful for lost/stolen devices

**Privacy note:**

- Only shows devices for current vault
- Same physical device appears as different devices across vaults
- No cross-vault device correlation visible to users or servers

### Multi-Factor Authentication (MFA)

- Require second factor on new device login
- Trust devices after successful MFA
- Periodic MFA challenges for high-risk operations

### Advanced Security

- Idle session timeout (logout after X minutes of inactivity)
- Concurrent session limits (max N devices at once)
- Geographic anomaly detection (login from new location)
- Device fingerprinting for additional verification

### Session Management

- Manual session extension (keep alive longer)
- Scheduled expiration reminders
- "Remember this device" option (longer expiration)
- Session inheritance (one device can trust another)

---

## Open Questions

1. **Session token length:** 32 bytes (64 hex chars) sufficient?
2. **Session expiration time:** 24 hours appropriate? Should be configurable?
3. **Idle timeout:** Should we logout after N minutes of inactivity?
4. **Device limit:** Should there be a max number of devices per vault?
5. **Session renewal window:** Renew when < 1 hour remaining, or different
   threshold?
6. **Background sync behavior:** Should it auto-renew sessions, or just fail and
   prompt user?
7. **Device name defaults:** Should serverDeviceName default to
   clientDeviceDescription or stay null?
8. **OS plugin installation:** Need to add `@tauri-apps/plugin-os` - any
   permission concerns?

---

## Compatibility Notes

### Current Code That Changes

**Client-side:**

- `tauri-ts/app/db/schema.ts` - Add `deviceId` and `deviceDescription` to
  `TableVault`
- `tauri-ts/app/lib/device.ts` - NEW: Device detection utilities using Tauri OS
  plugin
- `tauri-ts/app/lib/api-client.ts` - Change from `X-Vault-Login-Key` to
  `X-Vault-Session-Token`
- `tauri-ts/app/lib/sync-service.ts` - Store session token instead of login key
- `tauri-ts/app/contexts/vault-context.tsx` - Add session token to context
- `tauri-ts/app/routes/new-vault.3.tsx` - Generate deviceId and
  deviceDescription on vault creation
- `tauri-ts/app/routes/import-vault.tsx` - Generate deviceId and
  deviceDescription on vault import
- `tauri-ts/app/routes/unlock-vault.$vaultId.tsx` - Call login endpoint after
  password verification
- `tauri-ts/package.json` - Add `@tauri-apps/plugin-os` dependency

**Server-side:**

- `api-server/src/db/schema.ts` - Add `TableDeviceSession`
- `api-server/src/db/models/device-session.ts` - NEW: Device session model
- `api-server/src/procedures/base.ts` - New `sessionAuthedProcedure` middleware
- `api-server/src/procedures/login.ts` - NEW: Login endpoint (creates session)
- `api-server/src/procedures/logout.ts` - NEW: Logout endpoint (deletes session)
- All authenticated procedures - Switch from `vaultAuthedProcedure` to
  `sessionAuthedProcedure`

### Backward Compatibility

**During migration:**

- Both `X-Vault-Login-Key` and `X-Vault-Session-Token` accepted
- Server checks both headers, prefers session token
- Client automatically upgrades on next unlock

**After migration:**

- Remove `X-Vault-Login-Key` support
- All clients must use session tokens
- Old clients will get UNAUTHORIZED errors

---

## Privacy Architecture

KeyPears implements **per-vault device IDs** for maximum privacy:

**Cross-vault isolation:**

- Same physical device gets different device IDs for each vault
- `alice@keypears.com` vault → device ID: `01HQXYZ123...`
- `bob@hevybags.com` vault → device ID: `01HQXAB456...` (different!)
- Servers cannot correlate that these are the same physical device

**What's shared vs private:**

- ✅ Shared with specific vault's server: Per-vault device ID (random UUIDv7)
- ✅ Shared with specific vault's server: Device description ("macOS 14.1")
- ❌ NOT shared: Physical device identity
- ❌ NOT shared: Device IDs from other vaults
- ❌ NOT shared: List of other vaults this device accesses

**Why this matters:**

- User can use KeyPears for work vault (`alice@company.com`) and personal vault
  (`alice@personal.com`)
- Company server cannot tell if same device is used for personal vault
- Personal server cannot tell if same device is used for work vault
- Zero cross-domain tracking by design

**Contrast with typical password managers:**

- LastPass, 1Password, Bitwarden: Single device ID shared across all vaults
- Centralized provider can see all vaults accessed by a device
- KeyPears: Decentralized, each server only sees its own vault's devices

---

## Summary

**Current system:** Login key sent with every request, no device tracking, no
sessions

**New system:** Login key used once to get session token, all requests use
token, privacy-focused per-vault device tracking

**Benefits:**

- ✅ Reduced login key exposure (once per 24h vs 100+ times)
- ✅ Time-limited credentials (24h sessions vs permanent)
- ✅ **Hashed session tokens** - database breach does not expose usable tokens
- ✅ Defense in depth: Both login keys AND session tokens hashed server-side
- ✅ Privacy-focused device tracking (per-vault device IDs)
- ✅ No cross-vault device correlation possible
- ✅ Device tracking (know which devices have access to each vault)
- ✅ Revocable access (logout works, can revoke devices)
- ✅ Foundation for MFA/2FA
- ✅ Better auditability (know which device made changes)
- ✅ In-memory only (session tokens never persisted to disk)
- ✅ Human-readable device descriptions ("macOS 14.1", "iPhone (iOS 17.2)")

**Trade-offs:**

- Additional database table and indexes
- Slightly more complex client logic (session renewal)
- New endpoints to implement (login, logout)
- Migration period required

**Next steps:**

1. Review this document and iterate on design
2. Finalize open questions
3. Implement Phase 1 (database schema)
4. Test thoroughly before production deployment
