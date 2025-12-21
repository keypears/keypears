# Messaging System

This document describes KeyPears' secure, federated messaging system. The
messaging system serves as the foundation for all DH-based communication,
including future password/secret sharing.

## Overview

KeyPears messaging enables end-to-end encrypted communication between any two
vault addresses (e.g., `alice@example.com` ↔ `bob@example2.com`). Messages are
encrypted client-side using ECDH shared secrets, ensuring servers never see
plaintext content.

**Key properties:**

- End-to-end encrypted using derived engagement keys
- Federated: works across different domains
- PoW-gated to prevent spam
- Per-participant storage for full independence
- Optional vault sync for cross-device access
- Reverse chronological display (newest messages at top)

## Two-Layer Architecture

Messaging requires **two separate systems**:

### Layer 1: Channel Inbox (Server-Side, Temporary)

- Where incoming messages initially land
- Automatically synced to vault by background sync
- Spam control via PoW (Proof of Work)
- Messages deleted from inbox after sync to vault

### Layer 2: Vault Storage (Client-Side, Synced)

- Where messages live permanently
- Uses existing secret_update sync infrastructure
- Cross-device synchronization
- Offline access
- Encrypted with vault key

**This separation ensures:**

- Sender cannot inject directly into recipient's vault
- PoW protects against spam before messages reach inbox
- All messages that pass PoW are automatically synced to vault

## Protocol Flow

### Sending a Message

When Bob wants to message Alice:

```
1. RESOLVE: Bob resolves alice@example.com
   → Fetch https://example.com/.well-known/keypears.json
   → Confirm alice exists via API

2. GET MY KEY: Bob creates his engagement key (Bob's server)
   → Creates key with purpose: "send", counterpartyAddress: "alice@example.com"
   → Bob derives engagement private key locally

3. GET POW CHALLENGE: Bob requests challenge from Alice's server
   → Includes sender/recipient addresses for difficulty resolution
   → Alice's server returns difficulty based on:
     - Per-channel setting for Bob (if exists)
     - Otherwise Alice's global messagingMinDifficulty
     - Default: ~4 million (same as registration)

4. SOLVE POW: Bob's client mines the solution
   → WebGPU or WASM, same as registration
   → Produces: solvedHeader, solvedHash

5. SIGN POW: Bob signs the solved hash
   → Signs solvedHash with his engagement private key
   → Proves Bob owns the private key for his claimed pubkey

6. GET RECIPIENT KEY: Bob requests Alice's engagement key (Alice's server)
   → Alice's server performs THREE verification checks:
     a) Verify PoW is valid (hash meets target, not expired, not used)
     b) Verify signature matches Bob's claimed public key
     c) Cross-domain verification: call Bob's server to confirm
        "does this pubkey belong to bob@example2.com?"
   → If all pass: create "receive" engagement key, consume PoW, return pubkey
   → If any fail: reject request, do NOT consume PoW

7. ENCRYPT & SEND: Bob sends the encrypted message
   → Compute shared secret via ECDH
   → Encrypt message content with shared secret
   → Send to Alice's server with PoW reference (NOT re-verified)
   → Alice's server validates channel binding (PoW was consumed for THIS pair)

8. STORE MESSAGE: Message is now in Alice's inbox
   → Encrypted with shared secret
   → Alice's server cannot read content
   → Channel created if first message between Bob and Alice
```

### Channel Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  BOB (sender)                    ALICE (recipient)          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Resolve alice@example.com                               │
│     ↓                                                       │
│  2. Create Bob's engagement key (Bob's server)              │
│     ↓                                                       │
│  3. Derive engagement private key locally                   │
│     ↓                                                       │
│  4. Get PoW challenge from Alice's server                   │
│     (includes sender/recipient for difficulty)              │
│     ↓                                                       │
│  5. Solve PoW + Sign solvedHash                             │
│     ↓                                                       │
│  6. Request Alice's key with PoW + signature                │
│     ────────────────────────────────────→                   │
│                                  Alice's server verifies:   │
│                                  • PoW valid                │
│                                  • Signature valid          │
│                                  • Cross-domain check:      │
│                                    Bob's server confirms    │
│                                    pubkey belongs to bob@   │
│     ←────────────────────────────────────                   │
│  7. Receive Alice's engagement pubkey                       │
│     ↓                                                       │
│  8. Compute shared secret, encrypt, send message            │
│     (PoW reference only - already consumed)                 │
│     ────────────────────────────────────→                   │
│                                  9. Message lands in        │
│                                     Alice's inbox           │
│                                     ↓                       │
│                                  10. Background sync moves  │
│                                      message to Alice's vault│
│                                     ↓                       │
│                                  11. Alice can set low      │
│                                      difficulty for Bob     │
│     ←────────────────────────────────                       │
│  12. Alice replies (same flow with PoW for Bob's difficulty)│
│      ↓                                                      │
│  [Each NEW channel requires PoW + signature + verification] │
│  [Subsequent messages reference consumed PoW]               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Key Exchange

### Engagement Keys System

The engagement key infrastructure enables secure DH key exchange:

- Each engagement key has a **purpose**: "send", "receive", or "manual"
- Each engagement key tracks the **counterparty's public key** for validation
- Neither party exposes their primary vault public key

**Full DH Flow (Bob sends message to Alice):**

```
1. CREATE SENDER KEY: Bob creates his engagement key (on Bob's server)
   → Purpose: "send"
   → counterpartyAddress: "alice@example.com"
   → Bob derives engagement private key locally

2. GET POW CHALLENGE: Bob requests PoW challenge (from Alice's server)
   → Includes senderAddress + recipientAddress for difficulty resolution
   → Alice's server returns challenge with appropriate difficulty

3. SOLVE POW & SIGN: Bob solves the PoW and signs the result
   → Mine until hash meets target
   → Sign solvedHash with engagement private key (proves key ownership)

4. REQUEST RECIPIENT KEY: Bob requests Alice's engagement key (from Alice's server)
   → Bob provides: addresses, his pubkey, PoW proof, signature
   → Alice's server performs THREE verification checks:
     a) PoW verification: hash meets target, not expired, not used
     b) Signature verification: signature valid for Bob's claimed pubkey
     c) Cross-domain verification: call Bob's server via verifyEngagementKeyOwnership
        to confirm the pubkey belongs to bob@example2.com
   → If all pass: create engagement key with:
     - Purpose: "receive"
     - counterpartyAddress: "bob@example2.com"
     - counterpartyPubKey: Bob's pubkey (stored for later validation)
   → Mark PoW as consumed with channel binding (sender/recipient/pubkey)
   → Return: Alice's engagement pubkey

5. COMPUTE SHARED SECRET: Both sides can compute
   → shared_secret = ECDH(my_privkey, their_pubkey)
```

**Validation at message receipt:**

When Alice's server receives a message, it validates:

```
1. Look up engagement key by recipientEngagementPubKey
2. Validate engagement key:
   - purpose = "receive" ✓
   - counterpartyAddress = sender's address ✓
   - counterpartyPubKey = senderEngagementPubKey ✓
3. Validate PoW channel binding:
   - Look up PoW by powChallengeId
   - Verify isUsed = true (was consumed in getCounterpartyEngagementKey)
   - Verify senderAddress matches
   - Verify recipientAddress matches
   - Verify senderPubKey matches
4. Store message in inbox
```

This prevents:

- **Impersonation**: Signature + cross-domain verification ensures sender
  identity
- **DoS attacks**: PoW required before any engagement key is created
- **Replay attacks**: PoW is tied to specific sender+recipient+pubkey

### End-to-End Encryption

```
Bob sends message to Alice:

1. Bob computes: shared_secret = ECDH(bob_privkey, alice_pubkey)

2. Bob encrypts: encrypted_content = ACS2(message_content, shared_secret)

3. Bob sends to Alice's server:
   {
     senderAddress: "bob@example2.com",
     encryptedContent: "...",           // Server cannot read
     senderEngagementPubKey: "...",     // Bob's pubkey (for ECDH)
     recipientEngagementPubKey: "...",  // Alice's pubkey (for key lookup)
     powChallengeId: "...",             // Solved PoW proof
   }

4. Alice's server validates engagement key metadata and stores in inbox

5. Alice retrieves message from her server

6. Alice looks up her engagement key by recipientEngagementPubKey

7. Alice derives her private key from engagement key material

8. Alice computes: same_shared_secret = ECDH(alice_privkey, bob_pubkey)

9. Alice decrypts: message_content = ACS2_decrypt(encrypted_content, shared_secret)
```

**What servers see:**

- Channel metadata (who is talking to whom)
- Encrypted blobs (cannot decrypt)
- Message timestamps
- PoW proofs

**What servers CANNOT see:**

- Message content
- Attachment content
- Whether a message contains a password vs text

## Spam Prevention

### Per-Channel Proof-of-Work

Establishing a new channel requires proof-of-work. The PoW is consumed when the
sender requests the recipient's engagement key, NOT when sending individual
messages.

**Difficulty determination:**

1. **Per-channel override**: Recipient can set specific difficulty for known
   senders
2. **Global setting**: Each user has a default `messagingMinDifficulty` (default
   ~4M)
3. **System default**: Fallback to server's DEFAULT_MESSAGING_DIFFICULTY (~4M)

**How it works:**

1. Sender requests PoW challenge from recipient's server (includes addresses)
2. Server returns challenge with difficulty resolved from hierarchy above
3. Sender solves PoW and signs the solved hash with engagement private key
4. Sender requests recipient's engagement key with PoW proof + signature
5. Server verifies PoW + signature + cross-domain identity before creating key
6. PoW is marked as consumed with channel binding (sender/recipient/pubkey)
7. Subsequent messages reference the consumed PoW (not re-verified)

**Security properties:**

- **DoS prevention**: Attackers can't spam key requests without computational
  work
- **Identity verification**: Signature proves ownership; cross-domain call
  confirms identity
- **Channel binding**: PoW is tied to specific sender+recipient pair, preventing
  replay
- **Idempotent keys**: Same sender+pubkey returns same key (no storage
  exhaustion)

**Enabling easy replies:**

When you accept a channel from someone you trust, you can lower your per-channel
difficulty for them. Setting difficulty to a trivial value (e.g., 256) makes
their channel establishment effectively free while still requiring the
verification handshake.

**Recipient's controls:**

- Global PoW difficulty (default ~4M, can increase for more protection)
- Per-channel difficulty override (lower for trusted contacts)
- "Block" channel: Future enhancement, rejects at server level

**Server-side enforcement:**

- PoW + signature + identity verification required for
  `getCounterpartyEngagementKey`
- `sendMessage` only verifies channel binding (PoW already consumed)
- Difficulty lookup: per-channel override → vault setting → system default

## Message Format

### Extensible Message Content

```typescript
interface MessageContent {
  version: 1;
  type: "text" | "password" | "file" | "key"; // extensible

  // Common fields
  text?: string; // Always present for text messages

  // Type-specific payloads (future)
  passwordAttachment?: {
    secretId: string; // Reference to a secret
    encryptedBlob: string; // Full secret data, re-encrypted for recipient
  };

  fileAttachment?: {
    filename: string;
    mimeType: string;
    storageUrl: string; // External storage reference
    encryptionKey: string; // Key to decrypt the file
    checksum: string;
  };
}
```

**Phase 1 (MVP):** Only `type: "text"` supported **Phase 2:** Add
`type: "password"` for secret sharing **Phase 3:** Add `type: "file"` for
encrypted file sharing

### Size Limits

All encrypted data blobs (messages and secret updates) are limited to **10KB**
(`MAX_ENCRYPTED_DATA_BYTES = 10_000` bytes). Since data is hex-encoded, this
translates to 20,000 characters maximum. This limit accommodates text messages
and password entries while preventing abuse. Large files should be stored
externally and referenced via URL.

## Storage Model

### Direct-to-Recipient Architecture

Unlike email (where your server relays messages), KeyPears clients send directly
to the recipient's server. There is no server-side outbox.

```
Bob sends message to Alice:

1. Bob's client connects directly to Alice's server (2.com)
2. Message stored in Alice's inbox (on Alice's server)
3. Bob saves his sent message to his own vault (as secret_update)
4. Bob's server only sees the message if Bob syncs his vault
```

**Why no server-side outbox?**

- **Simpler**: No relay needed - client sends directly with PoW authentication
- **Privacy**: Bob's server doesn't know who Bob is messaging
- **Reuse**: Sent messages use existing vault sync infrastructure
- **Independence**: Each participant manages their own copies

### Inbox (Server-Side)

The server-side inbox is temporary storage before sync to vault:

| Property               | Description                    |
| ---------------------- | ------------------------------ |
| Server-side only       | Stored on recipient's server   |
| Temporary              | Deleted after sync to vault    |
| Incoming messages only | No outbox on server            |
| Auto-synced            | Background sync moves to vault |

### Sent Messages (Vault)

Sent messages are saved directly to your vault:

| Property                 | Description                       |
| ------------------------ | --------------------------------- |
| Client-side + sync       | Stored in vault, synced to server |
| Persistent               | Never expires                     |
| Full offline access      | Available without network         |
| Encrypted with vault key | Server can't read content         |

**User flows:**

**Sending a message:**

1. Client sends directly to recipient's server with PoW
2. Client calls `getSenderChannel` API to get/create sender's channel_view
3. Client saves sent message to local vault using channel's `secretId`
4. Vault syncs to your server via existing secret_update mechanism
5. Sent messages available on all your devices

**Receiving messages:**

- Background sync (`syncInboxMessages`) runs periodically
- For each channel with new inbox messages:
  1. Fetch inbox messages via `getInboxMessagesForSync` API
  2. Decrypt with ECDH shared secret (using engagement key)
  3. Re-encrypt with vault key
  4. Save as `secret_update` to vault
  5. Delete from inbox via `deleteInboxMessages` API
- User opens channel → messages loaded from local vault
- Messages decrypted client-side using vault key

**Display source:**

- All channels: Query local SQLite vault (`getSecretUpdatesBySecretId`)
- Background sync keeps vault up to date with server inbox

**Implementation:**

- Both sent and received messages become `secret_update` records with
  `type: "message"`
- Encrypted blob includes `direction: "sent" | "received"` and `messageData`
  object
- Channel's server-generated `secretId` used for all vault storage
- Uses existing sync infrastructure

## Data Model

### Server-Side (PostgreSQL)

**Important design principle**: The abstract "channel" between Alice and Bob
doesn't exist as a single database record anywhere. What exists is each
participant's **view** of the channel, stored on their own server. This is
essential for a federated system.

**Why channel views, not shared channels?**

- Alice's server (example.com) and Bob's server (example2.com) have separate
  databases
- Alice cannot know or store whether Bob synced to his vault - that's Bob's
  private state
- Even if Alice and Bob share the same server, they each have their own
  channel_view row
- Each view stores only the owner's state (their sync preference, their
  per-channel difficulty)

**New table: `channel_view`** (each participant's view of a channel)

```sql
id                      UUIDv7 primary key
owner_address           text (e.g., "alice@example.com") -- who owns this view
counterparty_address    text (e.g., "bob@example2.com") -- who they're talking to
min_difficulty          bigint (per-channel PoW override, null = use global setting)
secret_id               varchar(26) -- Server-generated ID for vault storage
created_at              timestamp
updated_at              timestamp
```

**Note on `secret_id`**: The server generates a unique `secretId` when creating
each channel_view. This ID is used as the `secretId` for all `secret_update`
records when messages are saved to the vault. Server-side generation ensures all
devices for the same user see the same `secretId` for the same channel,
preventing sync conflicts.

**Why no public keys in channel_view?** The channel is between two ADDRESSES,
not two public keys. Keys can change over time (rotation, fresh keys). Each
MESSAGE carries the public key(s) used at time of sending. The channel_view only
stores the fixed relationship metadata.

**Why no role field?** It doesn't matter who "initiated" the channel. What
matters is the per-channel difficulty setting. The channel is symmetric.

**Example**: When Bob sends a message to Alice:

```
Alice's server creates (recipient):
┌─────────────────────────────────────────────┐
│ channel_view (owner: alice@example.com)     │
│ counterparty: bob@example2.com              │
│ secret_id: "01JFXYZ..." (server-generated)  │
│ min_difficulty: null (use global)           │
└─────────────────────────────────────────────┘

Bob's server creates (sender, via getSenderChannel API):
┌─────────────────────────────────────────────┐
│ channel_view (owner: bob@example2.com)      │
│ counterparty: alice@example.com             │
│ secret_id: "01JFABC..." (server-generated)  │
│ min_difficulty: null (use global)           │
└─────────────────────────────────────────────┘
```

Note: Both participants have their own channel_view stored on their respective
servers.

**New table: `inbox_message`** (messages I received)

```sql
id                          UUIDv7 primary key
channel_view_id             FK → channel_view
sender_address              text (e.g., "bob@example.com")
order_in_channel            integer (1, 2, 3, ...)
encrypted_content           text (ACS2 encrypted with ECDH shared secret)
sender_engagement_pubkey    varchar(66) (sender's public key for ECDH)
recipient_engagement_pubkey varchar(66) (my public key, for looking up my private key)
pow_challenge_id            FK → pow_challenge (proves sender did work)
is_read                     boolean
created_at                  timestamp
expires_at                  timestamp (30 days from created_at, null if saved)
```

To decrypt an inbox message:

```
1. Look up my engagement key by recipient_engagement_pubkey
2. Derive my private key from engagement key material
3. Compute: sharedSecret = ECDH(myPrivKey, senderEngagementPubKey)
4. Decrypt: content = ACS2_decrypt(encrypted_content, sharedSecret)
```

**No server-side outbox table**

Sent messages are NOT stored on the server. Instead, the sender saves them
directly to their vault as `secret_update` records. This is simpler and more
private - the sender's server doesn't need to know who they're messaging.

To decrypt a sent message from vault:

```
1. Look up my engagement key by myEngagementPubKey (stored in vault entry)
2. Derive my private key from engagement key material
3. Compute: sharedSecret = ECDH(myPrivKey, theirEngagementPubKey)
4. Decrypt: content = ACS2_decrypt(encrypted_content, sharedSecret)
```

**Updated table: `engagement_key`** (add fields for messaging validation)

The existing `engagement_key` table is extended with two new fields:

```sql
-- New fields added to engagement_key table:
purpose                  varchar(30) ("send" | "receive" | "manual")
counterparty_pubkey      varchar(66) (other party's pubkey, for validation)
```

**Purpose field:**

- `"manual"` - User-created via Engagement Keys page (general purpose)
- `"send"` - Auto-created when initiating messaging to counterparty
- `"receive"` - Auto-created when counterparty requests a key to send me a
  message

**Counterparty pubkey field:**

- Stored when the key is created/requested
- Validated when message is received
- Ensures the sender is using the key they claimed they would use

**Validation flow at message receipt:**

```
1. Look up engagement key by recipientEngagementPubKey
2. Verify purpose = "receive"
3. Verify counterpartyAddress = sender's address
4. Verify counterpartyPubKey = senderEngagementPubKey
5. Verify isUsed = false
6. Mark key as used, store message
```

### Client-Side (SQLite)

**Messages stored in vault via `secret_update` table:**

Both sent and received messages use `type: "message"` in the existing
`secret_update` table.

```typescript
// Encrypted blob structure for messages
interface MessageSecretBlob {
  type: "message";
  direction: "sent" | "received";
  counterpartyAddress: string;  // e.g., "bob@example.com"

  // For decryption
  myEngagementPubKey: string;     // My pubkey used in this exchange
  theirEngagementPubKey: string;  // Their pubkey used in this exchange

  // Message content
  content: MessageContent;  // The actual message (text, etc.)
  timestamp: number;        // When sent/received
}
```

**Storage details:**

- `secretId` = channel's `secret_id` from `channel_view` (server-generated, NOT
  deterministic)
- `localOrder` = message order within channel (from server's `secret_update`)
- `encryptedBlob` = MessageSecretBlob encrypted with vault key

**New table: `contact`** (optional, for UI convenience)

```sql
id                  UUIDv7 primary key
vault_id            FK → vault (my vault)
address             text (e.g., "bob@example.com")
display_name        text (optional alias)
status              "active" | "blocked"
created_at          timestamp
last_message_at     timestamp
```

## Design Decisions

### Message Flow

- Messages that pass PoW are automatically synced to vault
- No manual accept/ignore workflow needed
- PoW is the only spam control gate

### Offline Handling

- If recipient's server is down, message send fails
- Retry is client responsibility
- Simple model, no cross-server queuing

### Read Receipts

- **Deferred to later** - privacy tradeoff to consider

### Reverse Chronological Order

Messages are displayed in **reverse chronological order** (newest at top, oldest
at bottom), with the compose box positioned above the message list. This differs
from most messaging apps which display chronologically (oldest at top).

**Rationale:**

- **Consistency**: Matches the display pattern used throughout the app
  (passwords, sync activity, channels list) where newest items appear first
- **Web platform compatibility**: Aligns with how the web naturally works -
  content at the top is seen first, scrolling down reveals older content
- **Simplicity**: Single consistent pattern across all list views reduces
  cognitive load and implementation complexity
- **Blog-like model**: Treats message threads like a feed where new content
  appears at the top, similar to blogs, social media feeds, and email inboxes

**Implementation:**

- APIs return messages in DESC order (newest first)
- Client displays messages in the order received from API
- "Load more" fetches older messages that appear below
- Compose box appears at the top, before the message list

## Integration with Existing Systems

### Reused Components

| Component           | How It's Used                                |
| ------------------- | -------------------------------------------- |
| Engagement Keys     | Public keys for ECDH + validation + signing  |
| PoW (pow5-64b)      | Per-channel spam prevention (at key request) |
| ECDSA signatures    | Sender identity proof (sign PoW hash)        |
| ACS2 encryption     | Message content encryption                   |
| Secret Updates      | Storage for saved messages                   |
| Sync infrastructure | Cross-device message sync                    |

### New Components Needed (All Implemented)

| Component                          | Purpose                                          | Status |
| ---------------------------------- | ------------------------------------------------ | ------ |
| `getCounterpartyEngagementKey` API | Get recipient's key (PoW + signature + identity) | ✅     |
| `verifyEngagementKeyOwnership` API | Cross-domain identity verification               | ✅     |
| `sendMessage` API                  | Send messages (channel binding verification)     | ✅     |
| `getChannelMessages` API           | Retrieve messages from inbox                     | ✅     |
| `getChannels` API                  | List channels for an address                     | ✅     |
| `getSenderChannel` API             | Create sender's channel_view                     | ✅     |
| `getInboxMessagesForSync` API      | Get inbox messages for sync                      | ✅     |
| `deleteInboxMessages` API          | Delete synced messages from inbox                | ✅     |
| PoW challenge APIs                 | Per-channel spam prevention                      | ✅     |
| Channel list UI                    | Messages tab interface                           | ✅     |
| Channel detail UI                  | Message thread view                              | ✅     |
| New message dialog                 | Compose and send new messages                    | ✅     |
| Compose box                        | Reply to messages with PoW                       | ✅     |

## Implementation Status

### Phase 0: Vault Settings (Prerequisite) - COMPLETE

- [x] Add settings JSON column to vault table
- [x] Create VaultSettings Zod schema
- [x] Add getVaultSettings/updateVaultSettings to vault model
- [x] Create getVaultSettings API procedure
- [x] Create updateVaultSettings API procedure
- [x] Add Settings menu item to user menu
- [x] Create vault settings UI page

Settings included in Phase 0:

- `messagingMinDifficulty`: Minimum PoW difficulty for channel opening (default:
  ~4M same as registration)

### Phase 0.5: Foundation Components - COMPLETE

- [x] Well-known discovery (`/.well-known/keypears.json`)
- [x] Engagement keys system with `counterpartyAddress` field
- [x] Messages UI placeholder route (`/vault/:vaultId/messages`)

### Phase 1: Server-Side Foundation - COMPLETE

- [x] Update `engagement_key` table with `purpose` and `counterparty_pubkey`
      fields
- [x] Add `channel_view` table to PostgreSQL
- [x] Add `inbox_message` table to PostgreSQL
- [x] Create Drizzle models (`channel.ts`, `inbox-message.ts`)
- [x] Note: NO outbox table - sent messages saved to sender's vault via
      secret_update
- [x] `getEngagementKeyForSending` - Create engagement key with purpose "send"
- [x] `getCounterpartyEngagementKey` - Public endpoint with three-layer
      verification: 1) PoW verification (prevents DoS) 2) Signature verification
      (proves key ownership) 3) Cross-domain identity verification via
      `verifyEngagementKeyOwnership` Creates key with purpose "receive", stores
      sender's pubkey for validation
- [x] `verifyEngagementKeyOwnership` - Public endpoint for cross-domain identity
      verification; confirms pubkey belongs to claimed address
- [x] `sendMessage` - Send message; validates channel binding (PoW was consumed
      for this sender+recipient pair) and engagement key metadata
- [x] `getChannels` - List channels for an address (with pagination, reverse
      chronological)
- [x] `getChannelMessages` - Get messages in a channel (reverse chronological
      order)
- [x] Unit tests for channel and inbox-message models
- [x] Integration test setup with vitest globalSetup (single `pnpm test`
      command)

### Phase 2: Client Integration - COMPLETE

- [x] ECDH shared secret computation (`@keypears/lib` - `ecdhSharedSecret`)
- [x] ECDSA signing/verification (`@keypears/lib` - `sign`, `verify`)
- [x] Message encryption/decryption (`message-encryption.ts`)
- [x] Channel list UI (`vault.$vaultId.messages._index.tsx`)
- [x] New message flow with PoW + signature (`new-message-dialog.tsx`)
- [x] Channel detail/thread view (`vault.$vaultId.messages.$channelId.tsx`)
- [x] Compose box with PoW mining + signature (`compose-box.tsx`)

### Phase 3: Vault Integration - COMPLETE

- [x] Messages page loads from local vault (synced via background process)
- [x] Passwords page filters `type !== "message"` via `excludeTypes` option
- [x] Auto-sync: `syncInboxMessages()` moves inbox messages to vault for all
      channels
- [x] Server-generated `secretId` in `channel_view` ensures consistency across
      devices
- [x] Sender saves messages to vault immediately after sending
- [x] `getSenderChannel` API creates sender's channel_view
- [x] `getInboxMessagesForSync` / `deleteInboxMessages` APIs for sync process

### Phase 4: Attachments (Future)

- [ ] Password attachment type
- [ ] Secret sharing via messages
- [ ] Future: file attachments

## Related Documentation

- [Diffie-Hellman Protocol](./dh.md) - Federated DH key exchange protocol
- [Vault Keys](./vault-keys.md) - Vault key architecture
- [Key Derivation Functions](./kdf.md) - Password-based key derivation
