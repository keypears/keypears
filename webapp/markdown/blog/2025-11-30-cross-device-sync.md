+++
title = "Building Secure Cross-Device Sync for a Decentralized Password Manager"
date = "2025-11-30T18:00:00-06:00"
author = "KeyPears Team"
+++

After weeks of intensive development, KeyPears now has a fully functional
cross-device synchronization system. This wasn't just about making data appear
on multiple devices—it was about building a secure, privacy-preserving sync
architecture that works in a decentralized environment where users can run their
own servers. Here's how we did it.

## The Challenge

Building sync for a password manager is fundamentally different from typical app
synchronization. Every design decision has security implications. When you're
also committed to a decentralized architecture where users might run their own
servers, the complexity multiplies. We needed to solve several interconnected
problems:

1. **Authentication without centralization** - No global user accounts or OAuth
   providers
2. **Device identity with privacy** - Track devices without cross-domain
   correlation
3. **Session management at scale** - Support hundreds of API calls without
   exposing long-term credentials
4. **Sync conflict resolution** - Handle concurrent edits from multiple devices
5. **Zero-knowledge architecture** - Servers should never see passwords or
   encryption keys

## The Solution: 2,000+ Lines of Carefully Crafted Code

Over the past week, we've implemented a comprehensive solution spanning 40 files
with over 2,000 lines of new code. Here's what we built:

### 1. Session-Based Authentication System

The biggest change was moving from a "login key with every request" model to
proper session-based authentication. This reduced our attack surface
dramatically:

**Before:** Login key sent 100+ times per session **After:** Login key sent once
per 24 hours

The new authentication flow works like this:

```typescript
// Login once per day
const { sessionToken, expiresAt } = await client.login({
  vaultId,
  loginKey,
  deviceId,
  deviceDescription: "macOS 14.1 (aarch64)"
});

// Use session token for all subsequent requests
const secrets = await client.getSecretUpdates({
  vaultId,
  lastUpdatedAt: lastSync
});
```

But here's the security innovation: we store session tokens as Blake3 hashes in
the database. Even if someone breaches the server database, they can't use the
stolen hashes—they'd need the original 32-byte random tokens, which exist only
in client memory.

### 2. Privacy-Preserving Device Tracking

Unlike centralized password managers that assign global device IDs, KeyPears
generates a unique device ID for each vault. This means:

- Your work vault and personal vault have different device IDs
- Servers can't correlate devices across domains
- Complete privacy preservation in a decentralized architecture

Each device gets identified with:

- A ULID (Universally Unique Lexicographically Sortable Identifier) per vault
- Auto-detected OS information: "iPhone (iOS 17.2)" or "Windows 11 (x86_64)"
- User-editable friendly names: "Ryan's MacBook Pro"

### 3. Background Sync Service

We built a robust background synchronization service that polls for changes
every 5 seconds:

```typescript
// Start sync when vault is unlocked
startBackgroundSync(vaultId, vaultDomain, vaultKey, getSession);

// Automatic sync every 5 seconds
// Manual sync after creating/editing secrets
await triggerManualSync();
```

The sync service includes sophisticated error handling:

- **401 Unauthorized**: Stop syncing, prompt for re-authentication
- **500+ Server Error**: Exponential backoff (5s → 10s → 20s)
- **Network Error**: Keep retrying at normal interval
- **Session Expiring**: Skip sync, avoid unnecessary 401s

### 4. Three-Tier Key Derivation System

We implemented a sophisticated key hierarchy that separates authentication from
encryption:

```
Master Password
    ↓ (100k rounds PBKDF)
Password Key (cached, PIN-encrypted)
    ├→ Encryption Key (device only, decrypts vault)
    └→ Login Key (sent to server for auth)
        ↓ (1k rounds on server)
    Hashed Login Key (database storage)
```

This asymmetric round count (100k client, 1k server) is intentional—the heavy
computation happens client-side for security, while the server just needs to
prevent raw token storage.

### 5. Comprehensive Test Coverage

We didn't just write code; we wrote tests. Lots of them:

- **283 lines** of authentication tests
- **278 lines** of device session tests
- Integration tests for the complete sync flow
- Database migration tests for schema changes

## Implementation Highlights

### React Closure Bug Fix

One of the trickiest bugs involved React closures capturing stale state. The
sync service was always getting a `null` session token because the closure
captured the initial value:

```typescript
// BUG: Closure captures initial null value
startBackgroundSync(vaultId, domain, key, () => session?.token);

// FIX: Use ref to get current value
const sessionRef = useRef(session);
useEffect(() => { sessionRef.current = session; }, [session]);
startBackgroundSync(vaultId, domain, key, () => sessionRef.current?.token);
```

### Tauri Plugin Integration

We integrated Tauri's OS detection plugin to automatically identify devices:

```rust
// Rust side
.plugin(tauri_plugin_os::init())

// TypeScript side
import { platform, version, arch } from "@tauri-apps/plugin-os";
const description = `${platform()} ${version()} (${arch()})`;
```

### Database Schema Evolution

Added a new `device_session` table with careful constraints:

```sql
CREATE TABLE device_session (
  id TEXT PRIMARY KEY,           -- ULID
  vault_id TEXT NOT NULL,
  device_id TEXT NOT NULL,        -- Per-vault device ULID
  hashed_session_token TEXT,      -- Blake3 hash, not raw token
  expires_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL,
  UNIQUE(vault_id, device_id),    -- One session per device
  FOREIGN KEY(vault_id) REFERENCES vault(id) ON DELETE CASCADE
);
```

## Security Improvements

The new system dramatically improves our security posture:

| Attack Vector         | Before             | After                  |
| --------------------- | ------------------ | ---------------------- |
| Token Interception    | Permanent access   | 24-hour maximum window |
| Database Breach       | Login keys exposed | Only unusable hashes   |
| Device Compromise     | No revocation      | Per-device logout      |
| Replay Attacks        | Vulnerable         | Time-limited tokens    |
| Cross-Domain Tracking | Possible           | Prevented by design    |

## Performance Optimizations

Beyond security, we optimized for performance:

1. **Smart Polling**: Only sync when there's an active session
2. **Exponential Backoff**: Reduce server load during errors
3. **Debounced Updates**: Batch rapid changes together
4. **Selective Sync**: Only fetch changes since last sync timestamp

## What's Next

With cross-device sync complete, KeyPears is approaching feature parity with
centralized password managers—while maintaining its decentralized,
privacy-preserving architecture. The foundation we've built enables future
features like:

- Multi-factor authentication (MFA)
- Device trust levels and approval workflows
- Geographic anomaly detection
- Granular access controls
- Offline-first mobile apps

## Technical Details

For the curious, here's the full scope of changes:

- **2,018 lines** of code across **40 files**
- **13 new API endpoints** for authentication and sync
- **2 new database tables** with migration scripts
- **166 lines** of sync service implementation
- **Test coverage** for all critical paths

The complete implementation is open source and available in our
[GitHub repository](https://github.com/keypears/keypears).

## Conclusion

Building secure cross-device sync for a decentralized password manager required
rethinking traditional approaches. By combining session-based authentication,
privacy-preserving device tracking, and sophisticated key derivation, we've
created a system that's both secure and user-friendly.

The key insight: security doesn't require sacrificing usability or privacy. With
careful architecture and attention to detail, we can build systems that protect
users without compromising their autonomy.

KeyPears now syncs your passwords across all your devices—instantly, securely,
and privately. Whether you're using our hosted service or running your own
server, your secrets stay yours.

_Next up: Implementing the Diffie-Hellman key exchange protocol for secure
secret sharing between users. Stay tuned!_

