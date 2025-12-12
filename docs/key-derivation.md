# Key Derivation Implementation Plan

This document outlines the implementation plan for KeyPears' derived key
generation system. The goal is to build a "Keys" page in the Tauri app that
demonstrates the full key derivation flow, where servers can generate public
keys for users while only the user can derive the corresponding private keys.

## Overview

The key derivation system enables:

1. **Offline key generation**: Server generates public keys while user is
   offline
2. **User-only private keys**: Only the vault owner can derive private keys
3. **Per-key isolation**: Each derived key uses fresh entropy

The system combines three entropy sources:

- **Server entropy**: `DERIVATION_ENTROPY_N` from environment variables
- **DB entropy**: Random 32 bytes generated per derived key
- **Vault key**: User's master private key (never leaves client)

## Cryptographic Flow

### Server-Side: Generate Derived Public Key

```
1. db_entropy = random(32 bytes)
2. derivation_privkey = HMAC-SHA256(key: server_entropy, data: db_entropy)
3. derivation_pubkey = derivation_privkey * G
4. derived_pubkey = vault_pubkey + derivation_pubkey
```

### Client-Side: Derive Private Key

```
1. Request derivation_privkey from server
2. derived_privkey = vault_privkey + derivation_privkey
3. Verify: derived_privkey * G == derived_pubkey
```

## Implementation Steps

### Step 1: @keypears/lib - Crypto Utilities

- [x] Export `privateKeyAdd` from `@webbuf/secp256k1`
- [x] Export `publicKeyAdd` from `@webbuf/secp256k1`
- [x] Add `deriveDerivationPrivKey(serverEntropy, dbEntropy)` function
- [x] Run `pnpm run lint && pnpm run typecheck && pnpm run test`

### Step 2: @keypears/api-server - Schema Updates

#### Step 2.1: Vault Table Update

- [x] Add `vaultPubKey` column to `TableVault` (varchar 66, 33 bytes hex)
- [x] Update `registerVault` procedure to accept `vaultPubKey` parameter
- [x] Update `registerVault` procedure to store `vaultPubKey`
- [x] Update Zod schemas for vault registration

#### Step 2.2: Derived Keys Table

- [x] Create `TableDerivedKey` in `api-server/src/db/schema.ts`:

| Column                 | Type         | Description                      |
| ---------------------- | ------------ | -------------------------------- |
| `id`                   | varchar(26)  | ULID primary key                 |
| `vault_id`             | varchar(26)  | FK to vault                      |
| `db_entropy`           | varchar(64)  | 32 bytes hex                     |
| `db_entropy_hash`      | varchar(64)  | SHA256(db_entropy)               |
| `server_entropy_index` | integer      | Which DERIVATION_ENTROPY_N       |
| `derivation_pubkey`    | varchar(66)  | 33 bytes hex - addend public key |
| `derived_pubkey`       | varchar(66)  | 33 bytes hex - final public key  |
| `derived_pubkey_hash`  | varchar(64)  | SHA256(derived_pubkey)           |
| `counterparty_address` | varchar(255) | nullable - for future DH use     |
| `vault_generation`     | integer      | default 1                        |
| `created_at`           | timestamp    | when generated                   |
| `is_used`              | boolean      | default false                    |

- [x] Add unique index on `derived_pubkey_hash`
- [x] Add index on `(vault_id, created_at DESC)`
- [x] Add index on `(vault_id, is_used, created_at)`
- [x] Run `pnpm run lint && pnpm run typecheck`

### Step 3: @keypears/api-server - New Procedures

#### Step 3.1: createDerivedKey Procedure

- [x] Create `api-server/src/procedures/create-derived-key.ts`
- [x] Authenticate via session token (same pattern as other procedures)
- [x] Generate `db_entropy = FixedBuf.fromRandom(32)`
- [x] Get current server entropy index via `getCurrentDerivationKeyIndex()`
- [x] Get current server entropy via `getCurrentDerivationKey()`
- [x] Compute `derivation_privkey = sha256Hmac(server_entropy, db_entropy)`
- [x] Compute `derivation_pubkey = publicKeyCreate(derivation_privkey)`
- [x] Look up vault's `vaultPubKey` from database
- [x] Compute `derived_pubkey = publicKeyAdd(vault_pubkey, derivation_pubkey)`
- [x] Compute hashes for storage
- [x] Insert record into `derived_keys` table
- [x] Return `{ id, derivedPubKey, createdAt }`
- [x] Add to router in `api-server/src/index.ts`

#### Step 3.2: getDerivedKeys Procedure

- [x] Create `api-server/src/procedures/get-derived-keys.ts`
- [x] Authenticate via session token
- [x] Accept `limit` (default 20, max 100) and `beforeCreatedAt` (optional
      cursor)
- [x] Query `derived_keys` table for vault, ordered by `created_at DESC`
- [x] Return `{ keys: [{ id, derivedPubKey, createdAt, isUsed }], hasMore }`
- [x] Add to router in `api-server/src/index.ts`

#### Step 3.3: getDerivationPrivKey Procedure

- [x] Create `api-server/src/procedures/get-derivation-privkey.ts`
- [x] Authenticate via session token
- [x] Accept `derivedKeyId`
- [x] Look up record, verify it belongs to authenticated vault
- [x] Retrieve `db_entropy` and `server_entropy_index` from record
- [x] Get server entropy for that index via `getDerivationKey(index)`
- [x] Compute `derivation_privkey = sha256Hmac(server_entropy, db_entropy)`
- [x] Return `{ derivationPrivKey }` (hex string)
- [x] Add to router in `api-server/src/index.ts`

#### Step 3.4: Final Checks

- [x] Run `pnpm run lint && pnpm run typecheck && pnpm run build`
- [x] Test with `pnpm run test:server`

### Step 4: @keypears/tauri-ts - Vault Creation Update

- [x] Update vault creation to compute
      `vaultPubKey = publicKeyCreate(vaultPrivKey)`
- [x] Update `registerVault` call to include `vaultPubKey`
- [x] Test vault creation still works

### Step 5: @keypears/tauri-ts - Keys Page

#### Step 5.1: Route Setup

- [x] Create `tauri-ts/app/routes/vault.$vaultId.keys.tsx`
- [x] Add `clientLoader` for initial data fetch
- [x] Implement basic page structure with header

#### Step 5.2: Key List Component

- [x] Create key card component showing:
  - Derived public key (truncated, copy button)
  - Created timestamp (relative format)
  - "Show Private Key" button
- [x] Implement key list with map over keys array
- [x] Style with existing UI patterns (shadcn, Catppuccin)

#### Step 5.3: Generate New Key

- [x] Add "Generate New Key" button at top of page
- [x] Call `createDerivedKey` API on click
- [x] Refresh key list after generation
- [x] Show loading state during generation

#### Step 5.4: Load More Pagination

- [x] Add "Load More" button at bottom when `hasMore` is true
- [x] Use `useFetcher` for pagination requests
- [x] Pass `beforeCreatedAt` cursor for next page
- [x] Append new keys to existing list

#### Step 5.5: Show Private Key

- [x] Add state to track which key's private key is shown
- [x] On "Show Private Key" click:
  - Call `getDerivationPrivKey` API
  - Get vault private key from unlocked vault store
  - Compute `derivedPrivKey = privateKeyAdd(vaultPrivKey, derivationPrivKey)`
  - Verify `publicKeyCreate(derivedPrivKey) == derivedPubKey`
  - Display derived private key
- [x] Add "Hide Private Key" toggle
- [x] Add copy button for private key

#### Step 5.6: Final Polish

- [x] Add loading states for all async operations
- [x] Add error handling with user-friendly messages
- [x] Run `pnpm run lint && pnpm run typecheck`

### Step 6: @keypears/tauri-ts - User Menu Update

- [x] Import `Key` icon from `lucide-react`
- [x] Add "Keys" menu item to `user-menu.tsx`
- [x] Link to `/vault/:vaultId/keys` using `href()`

### Step 7: Database Migration

- [x] Run `pnpm db:dev:clear` in webapp directory
- [x] Run `pnpm db:dev:push` in webapp directory
- [x] Verify schema is correct in database

### Step 8: Integration Testing

- [ ] Start webapp with `pnpm run dev`
- [ ] Create a new vault (verify public key is stored)
- [ ] Navigate to Keys page
- [ ] Generate 3-5 derived keys
- [ ] Verify keys appear in reverse chronological order
- [ ] Test "Load More" pagination (if enough keys)
- [ ] Click "Show Private Key" on a key
- [ ] Verify private key is displayed
- [ ] Verify `publicKeyCreate(derivedPrivKey) == derivedPubKey` (manual check or
      console log)
- [ ] Copy public key, verify clipboard
- [ ] Copy private key, verify clipboard

## File Changes Summary

### New Files

- `api-server/src/procedures/create-derived-key.ts`
- `api-server/src/procedures/get-derived-keys.ts`
- `api-server/src/procedures/get-derivation-privkey.ts`
- `tauri-ts/app/routes/vault.$vaultId.keys.tsx`

### Modified Files

- `lib/src/index.ts` - export new crypto functions
- `api-server/src/db/schema.ts` - add vault pubkey column, derived keys table
- `api-server/src/index.ts` - add new procedures to router
- `api-server/src/procedures/register-vault.ts` - accept vault pubkey
- `api-server/src/zod-schemas.ts` - update vault registration schema
- `tauri-ts/app/components/user-menu.tsx` - add Keys menu item
- `tauri-ts/app/routes/new-vault.*.tsx` or vault creation logic - send pubkey

## Dependencies

The following `@webbuf` packages are already installed and will be used:

- `@webbuf/secp256k1` - `privateKeyAdd`, `publicKeyAdd`, `publicKeyCreate`
- `@webbuf/sha256` - `sha256Hmac`, `sha256Hash`
- `@webbuf/fixedbuf` - `FixedBuf` for typed buffers

## Security Considerations

- **Server never learns vault private key**: Only stores public key
- **Derivation private key is temporary**: Computed on-demand, not stored
- **Per-key entropy**: Each derived key has unique DB entropy
- **Entropy rotation**: Server entropy index is stored, enabling rotation

## Future Work

After this implementation:

- Use derived keys for Diffie-Hellman key exchange (Phase 4)
- Add `counterparty_address` support for relationship-specific keys
- Implement key caching in client SQLite
- Add vault generation tracking for key rotation
