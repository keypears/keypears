# Polling & Sync Service

This document describes the Tauri desktop app's polling service architecture,
including how vault state is stored in Rust and how synchronization works.

## Overview

The Tauri app uses a **unified polling service** that:

- Syncs all unlocked vaults every 500ms
- Stores state in Rust backend (survives webview reloads)
- Auto-refreshes expired sessions using stored `loginKey`
- Uses fault-tolerant batch processing

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri App                                │
├─────────────────────────────────────────────────────────────┤
│  TypeScript (WebView)                                       │
│  ┌─────────────────┐    ┌──────────────────┐               │
│  │  vault-store.ts │◄───│  sync-service.ts │               │
│  │  (local cache)  │    │  (polling loop)  │               │
│  └────────┬────────┘    └──────────────────┘               │
│           │ invoke()                                        │
├───────────┼─────────────────────────────────────────────────┤
│  Rust Backend                                               │
│  ┌────────▼────────┐                                       │
│  │    AppState     │                                       │
│  │  Mutex<HashMap> │  ← Source of truth                    │
│  └─────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### State Storage (Rust Backend)

**File:** `tauri-rs/src/lib.rs`

The Rust backend stores unlocked vault state in memory using thread-safe
`Mutex<HashMap>` structures:

```rust
struct AppState {
    unlocked_vaults: Mutex<HashMap<String, UnlockedVault>>,
    sessions: Mutex<HashMap<String, SessionState>>,
}
```

**Tauri Commands:**

| Command                   | Purpose                          |
| ------------------------- | -------------------------------- |
| `store_unlocked_vault`    | Add vault to unlocked state      |
| `remove_unlocked_vault`   | Remove vault from unlocked state |
| `get_all_unlocked_vaults` | Get all unlocked vaults          |
| `store_session`           | Store session token for a vault  |
| `remove_session`          | Remove session for a vault       |
| `get_all_sessions`        | Get all sessions                 |

**Key storage format:**

- Cryptographic keys stored as hex strings
- `FixedBuf<32>` (256-bit keys) → 64-character hex
- `FixedBuf<33>` (public keys) → 66-character hex

### State Management (TypeScript)

**File:** `tauri-ts/app/lib/vault-store.ts`

The TypeScript layer maintains a local cache that mirrors the Rust state:

```typescript
// Local cache (populated from Rust)
const unlockedVaults: Map<string, UnlockedVault> = new Map();
const sessions: Map<string, SessionState> = new Map();
```

**Key functions:**

| Function               | Type  | Purpose                              |
| ---------------------- | ----- | ------------------------------------ |
| `loadStateFromRust`    | async | Populate local cache from Rust       |
| `unlockVault`          | async | Store vault in Rust + local cache    |
| `lockVault`            | async | Remove vault from Rust + local cache |
| `setSession`           | async | Store session in Rust + local cache  |
| `getUnlockedVault`     | sync  | Read from local cache                |
| `isVaultUnlocked`      | sync  | Check local cache                    |
| `getAllUnlockedVaults` | sync  | Get all vaults from local cache      |

**Design principle:** Async setters persist to Rust (source of truth), sync
getters read from local cache for performance.

### Unified Polling Service

**File:** `tauri-ts/app/lib/sync-service.ts`

A single polling service handles all vault synchronization:

```typescript
const POLL_INTERVAL = 500; // 500ms for near-realtime messaging
const BATCH_SIZE = 10; // Process 10 vaults per tick
```

**Key characteristics:**

- **Always running** - Started on app init, runs for app lifetime
- **Stateless** - Loads fresh state from Rust each tick
- **Fault-tolerant** - Uses `Promise.allSettled` so one vault failure doesn't
  affect others
- **Batched** - Processes vaults in batches of 10 to prevent overwhelming the
  server

## Initialization Flow

**File:** `tauri-ts/app/root.tsx`

```typescript
export async function clientLoader() {
  await runMigrations(); // Run database migrations
  await loadStateFromRust(); // Restore vault state from Rust
  startPollingService(); // Start unified polling
  return null;
}
```

**Sequence:**

1. App starts → React Router calls `clientLoader` in `root.tsx`
2. `loadStateFromRust()` populates TypeScript cache from Rust backend
3. `startPollingService()` starts the 500ms polling interval
4. If vaults were unlocked before webview reload, they're immediately available

## Poll Tick Flow

Each poll tick (every 500ms) executes:

```
pollTick()
    │
    ├── 1. loadStateFromRust()
    │       └── Refresh local cache from Rust
    │
    ├── 2. getAllUnlockedVaults()
    │       └── Get list of unlocked vaults
    │
    └── 3. For each batch of 10 vaults:
            │
            └── Promise.allSettled(batch.map(syncVaultIfNeeded))
                    │
                    ├── Check session validity
                    ├── Refresh session if expired (using loginKey)
                    ├── Sync vault with server
                    └── Update UI state
```

## Session Management

Sessions are stored per-vault and include expiry times:

```typescript
interface SessionState {
  sessionToken: string;
  expiresAt: number; // Unix timestamp (ms)
}
```

**Session lifecycle:**

1. **Initial login** - User enters password → `loginKey` derived → API login →
   session token received
2. **During polling** - Session token used for API calls
3. **Expiry check** - Each poll tick checks if session is expired or expiring
   soon
4. **Auto-refresh** - If expired, use stored `loginKey` to get new session token
   (no password re-entry)
5. **Proactive refresh** - Sessions refreshed 5 minutes before expiry

**Session refresh:**

```typescript
async function refreshSessionForVault(vaultId: string): Promise<boolean> {
  const vault = getUnlockedVault(vaultId);
  // Use stored loginKey to get new session - no password needed
  const response = await client.api.login({
    vaultId,
    loginKey: vault.loginKey.buf.toHex(),
    deviceId: vault.deviceId,
    // ...
  });
  await setSession(vaultId, response.sessionToken, response.expiresAt);
}
```

## Behavior Summary

| Scenario        | Behavior                                           |
| --------------- | -------------------------------------------------- |
| App starts      | Load state from Rust, start polling                |
| Webview reload  | State persists, polling continues automatically    |
| Unlock vault    | Store in Rust → next poll tick picks it up         |
| Lock vault      | Remove from Rust → polling ignores it              |
| Session expires | Auto-refresh using stored `loginKey`               |
| App restart     | State cleared (Rust memory cleared), vaults locked |

## Security Considerations

1. **Keys in Rust memory** - Cryptographic keys stored in Rust, not accessible
   via browser devtools
2. **Survives webview reload** - State persists across right-click → Reload
3. **Does NOT survive app restart** - Keys cleared when app closes (in-memory
   only)
4. **No disk persistence** - Keys never written to disk, only stored in RAM
5. **Auto-refresh** - Uses stored `loginKey` so user doesn't need to re-enter
   password after session expiry

## Error Handling

The polling service handles errors gracefully:

- **401 Unauthorized** - Session invalid, attempts refresh using `loginKey`
- **5xx Server errors** - Logged, retried on next tick
- **4xx Client errors** - Logged, vault skipped for this tick
- **Network errors** - Logged, retried on next tick

**Log deduplication:** Repeated errors for the same vault are only logged once
to prevent log spam.

## Related Documentation

- [Authentication](auth.md) - Session-based authentication details
- [Key Derivation](kdf.md) - How `loginKey` is derived from password
- [Data Patterns](data.md) - Database schema and sync conflict resolution
