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

## Two-Layer Architecture

Messaging requires **two separate systems**:

### Layer 1: Channel Inbox (Server-Side, Ephemeral)

- Where incoming messages land
- NOT automatically synced to vault
- Sender cannot inject into recipient's vault
- Recipient chooses what to accept/save
- Messages expire after 30 days if not saved

### Layer 2: Vault Storage (Client-Side, Synced)

- Where saved messages live permanently
- Uses existing secret_update sync infrastructure
- Cross-device synchronization
- Offline access
- Encrypted with vault key

**This separation ensures:**

- Senders can send messages without polluting recipient's vault
- Recipients control what gets synchronized
- Spam stays in the inbox, not the vault

## Protocol Flow

### Sending a Message

When Bob wants to message Alice:

```
1. RESOLVE: Bob resolves alice@example.com
   → Fetch https://example.com/.well-known/keypears.json
   → Confirm alice exists via API

2. GET KEYS: Bob establishes DH relationship
   → Get/create Bob's engagement key for Alice (from Bob's server, purpose: "send")
   → Get Alice's engagement key for Bob (from Alice's server, purpose: "receive")
   → Alice's server stores Bob's pubkey for later validation
   → Compute shared secret via ECDH

3. GET CHALLENGE: Bob requests PoW challenge from Alice's server
   → Alice's server returns challenge with difficulty based on:
     - Per-channel setting for Bob (if exists)
     - Otherwise Alice's global messagingMinDifficulty
   → Default difficulty: ~4 million (same as registration)

4. SOLVE PoW: Bob's client mines the solution
   → WebGPU or WASM, same as registration

5. SEND MESSAGE: Bob submits message to Alice's server
   → Includes: PoW proof, both engagement pubkeys, encrypted message
   → Alice's server validates engagement key metadata
   → Alice's server marks engagement key as used

6. STORE MESSAGE: Message is now in Alice's inbox
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
│  2. Get engagement keys (both sides)                        │
│     ↓                                                       │
│  3. Compute shared secret                                   │
│     ↓                                                       │
│  4. Get PoW challenge from Alice's server                   │
│     ↓                                                       │
│  5. Solve PoW (difficulty set by Alice)                     │
│     ↓                                                       │
│  6. Send message with PoW proof                             │
│     ────────────────────────────────────→                   │
│                                  7. Channel appears in      │
│                                     Alice's "Pending"       │
│                                     ↓                       │
│                                  8. Alice saves/ignores     │
│                                     ↓                       │
│                                  9. If saved, Alice can     │
│                                     set low difficulty for  │
│                                     Bob to make replies easy│
│     ←────────────────────────────────                       │
│  10. Alice replies (with PoW for Bob's difficulty)          │
│      ↓                                                      │
│  [Each message requires PoW at recipient's difficulty]      │
│                                                             │
│  If Alice ignores:                                          │
│  - Bob's messages still delivered to inbox                  │
│  - Alice doesn't see them in main view                      │
│  - Bob doesn't know he's ignored                            │
│  - Bob must pay PoW for each additional message             │
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
   → counterpartyPubKey: null (Alice's key, not known yet)

2. REQUEST RECIPIENT KEY: Bob requests Alice's engagement key (from Alice's server)
   → Bob provides: his address + his pubkey
   → Alice's server creates engagement key:
     - Purpose: "receive"
     - counterpartyAddress: "bob@example2.com"
     - counterpartyPubKey: Bob's pubkey (stored for later validation)
   → Alice's server returns: Alice's engagement pubkey

3. UPDATE SENDER KEY: Bob updates his engagement key (on Bob's server)
   → counterpartyPubKey: Alice's pubkey (now known)

4. COMPUTE SHARED SECRET: Both sides can compute
   → shared_secret = ECDH(my_privkey, their_pubkey)
```

**Validation at message receipt:**

When Alice's server receives a message, it validates the engagement key:

```
1. Look up engagement key by recipientEngagementPubKey
2. Validate:
   - purpose = "receive" ✓
   - counterpartyAddress = sender's address ✓
   - counterpartyPubKey = senderEngagementPubKey ✓
   - isUsed = false ✓
3. Mark engagement key as used
4. Store message in inbox
```

This prevents misuse - someone cannot use a key meant for a different person or purpose.

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

### Per-Message Proof-of-Work

Every message requires proof-of-work. The difficulty is determined by the recipient's
settings:

1. **Global setting**: Each user has a default `messagingMinDifficulty` (default ~4M)
2. **Per-channel override**: Can set different difficulty for specific counterparties

**How it works:**

1. Sender requests PoW challenge from recipient's server
2. Server returns challenge with difficulty based on recipient's settings
3. Sender solves PoW and submits message with proof
4. Server verifies PoW before accepting message

**Enabling easy replies:**

When you accept a channel from someone you trust, you can lower your per-channel
difficulty for them. Setting difficulty to a trivial value (e.g., 256) makes their
messages effectively free while still requiring the PoW handshake.

**Recipient's controls:**

- Global PoW difficulty (default ~4M, can increase for more protection)
- Per-channel difficulty override (lower for trusted contacts)
- "Ignore" channel: Sender never knows, but recipient doesn't see messages
- "Block" channel: Future enhancement, rejects at server level

**Server-side enforcement:**

- PoW verification before accepting any message
- Difficulty lookup: per-channel override → global setting → system default

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

**Phase 1 (MVP):** Only `type: "text"` supported
**Phase 2:** Add `type: "password"` for secret sharing
**Phase 3:** Add `type: "file"` for encrypted file sharing

## Storage Model

### Direct-to-Recipient Architecture

Unlike email (where your server relays messages), KeyPears clients send directly to
the recipient's server. There is no server-side outbox.

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

The server-side inbox stores messages you've received:

| Property               | Description                     |
| ---------------------- | ------------------------------- |
| Server-side only       | Stored on recipient's server    |
| Ephemeral (30 days)    | Expires if not saved to vault   |
| Incoming messages only | No outbox on server             |
| No offline access      | Must fetch from server          |

### Sent Messages (Vault)

Sent messages are saved directly to your vault:

| Property               | Description                     |
| ---------------------- | ------------------------------- |
| Client-side + sync     | Stored in vault, synced to server |
| Persistent             | Never expires                   |
| Full offline access    | Available without network       |
| Encrypted with vault key | Server can't read content     |

**User flows:**

**Sending a message:**

1. Client sends directly to recipient's server with PoW
2. Client calls `getSenderChannel` API to get/create sender's channel_view (status: "saved")
3. Client saves sent message to local vault using channel's `secretId`
4. Vault syncs to your server via existing secret_update mechanism
5. Sent messages available on all your devices

**Receiving messages (pending/ignored channels):**

- User opens Messages tab → fetches channels from server
- Opens a channel → fetches messages from server's inbox
- Messages decrypted client-side using ECDH (engagement keys)
- Channels marked as "pending" until user saves or ignores

**Receiving messages (saved channels):**

- Background sync (`syncInboxMessages`) runs periodically
- For each saved channel with new inbox messages:
  1. Fetch inbox messages via `getInboxMessagesForSync` API
  2. Decrypt with ECDH shared secret (using engagement key)
  3. Re-encrypt with vault key
  4. Save as `secret_update` to vault
  5. Delete from inbox via `deleteInboxMessages` API
- User opens saved channel → messages loaded from local vault (not server)
- Messages decrypted client-side using vault key

**Auto-save on reply:**

- When replying to a "pending" or "ignored" channel, it automatically becomes "saved"
- Rationale: sending a reply = you care about this conversation = save it
- Better UX than requiring manual "Save" before replying

**Display source logic:**

- **Saved channels**: Query local SQLite vault (`getSecretUpdatesBySecretId`)
- **Pending/ignored channels**: Query server inbox (`getChannelMessages` API)
- When channel status changes to "saved", UI reloads from vault

**Implementation:**

- Both sent and received messages become `secret_update` records with `type: "message"`
- Encrypted blob includes `direction: "sent" | "received"` and `messageData` object
- Channel's server-generated `secretId` used for all vault storage
- Uses existing sync infrastructure

## Data Model

### Server-Side (PostgreSQL)

**Important design principle**: The abstract "channel" between Alice and Bob doesn't
exist as a single database record anywhere. What exists is each participant's **view**
of the channel, stored on their own server. This is essential for a federated system.

**Why channel views, not shared channels?**

- Alice's server (example.com) and Bob's server (example2.com) have separate databases
- Alice cannot know or store whether Bob synced to his vault - that's Bob's private state
- Even if Alice and Bob share the same server, they each have their own channel_view row
- Each view stores only the owner's state (their sync preference, their per-channel difficulty)

**New table: `channel_view`** (each participant's view of a channel)

```sql
id                      UUIDv7 primary key
owner_address           text (e.g., "alice@example.com") -- who owns this view
counterparty_address    text (e.g., "bob@example2.com") -- who they're talking to
status                  "pending" | "saved" | "ignored"
min_difficulty          text (per-channel PoW override, null = use global setting)
secret_id               varchar(26) -- Server-generated ID for vault storage
created_at              timestamp
updated_at              timestamp
```

**Note on `secret_id`**: The server generates a unique `secretId` when creating each
channel_view. This ID is used as the `secretId` for all `secret_update` records when
messages are saved to the vault. Server-side generation ensures all devices for the
same user see the same `secretId` for the same channel, preventing sync conflicts.

Note: `saved_to_vault` was removed - the `status: "saved"` indicates the channel is saved.

**Why no public keys in channel_view?** The channel is between two ADDRESSES, not two
public keys. Keys can change over time (rotation, fresh keys). Each MESSAGE carries the
public key(s) used at time of sending. The channel_view only stores the fixed relationship
metadata.

**Why no role field?** It doesn't matter who "initiated" the channel. What matters is
the current state: status, sync preference, and per-channel difficulty. The channel is symmetric.

**Example**: When Bob sends a message to Alice:

```
Alice's server creates (recipient):
┌─────────────────────────────────────────────┐
│ channel_view (owner: alice@example.com)     │
│ counterparty: bob@example2.com              │
│ status: "pending"                           │
│ secret_id: "01JFXYZ..." (server-generated)  │
│ min_difficulty: null (use global)           │
└─────────────────────────────────────────────┘

Bob's server creates (sender, via getSenderChannel API):
┌─────────────────────────────────────────────┐
│ channel_view (owner: bob@example2.com)      │
│ counterparty: alice@example.com             │
│ status: "saved" (sender always saves)       │
│ secret_id: "01JFABC..." (server-generated)  │
│ min_difficulty: null (use global)           │
└─────────────────────────────────────────────┘
```

Note: Both participants have their own channel_view. The sender's is created with
`status: "saved"` (you initiated it, so you want it saved). The recipient's starts
as `"pending"` until they decide to save or ignore it.

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

Sent messages are NOT stored on the server. Instead, the sender saves them directly
to their vault as `secret_update` records. This is simpler and more private - the
sender's server doesn't need to know who they're messaging.

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
- `"receive"` - Auto-created when counterparty requests a key to send me a message

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

Both sent and received messages use `type: "message"` in the existing `secret_update` table.

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

- `secretId` = channel's `secret_id` from `channel_view` (server-generated, NOT deterministic)
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

### Message Expiration

- **Unsaved inbox messages expire after 30 days**
- Saved messages (in vault) never expire
- This prevents inbox bloat while giving reasonable time window

### Ignored Channel Behavior

- **Messages are still stored** when recipient ignores sender
- Sender still pays PoW for each message
- Recipient can un-ignore later and see full history
- This preserves optionality for recipient

### Offline Handling

- If recipient's server is down, message send fails
- Retry is client responsibility
- Simple model, no cross-server queuing

### Read Receipts

- **Deferred to later** - privacy tradeoff to consider

## Integration with Existing Systems

### Reused Components

| Component           | How It's Used                    |
| ------------------- | -------------------------------- |
| Engagement Keys     | Public keys for ECDH + validation|
| PoW (pow5-64b)      | Per-message spam prevention      |
| ACS2 encryption     | Message content encryption       |
| Secret Updates      | Storage for saved messages       |
| Sync infrastructure | Cross-device message sync        |

### New Components Needed (All Implemented)

| Component                    | Purpose                                      | Status |
| ---------------------------- | -------------------------------------------- | ------ |
| `sendMessage` API            | Send messages with PoW validation            | ✅     |
| `getChannelMessages` API     | Retrieve messages from inbox                 | ✅     |
| `getChannels` API            | List channels for an address                 | ✅     |
| `updateChannelStatus` API    | Accept/ignore channels                       | ✅     |
| `getSenderChannel` API       | Create sender's channel_view (status: saved) | ✅     |
| `getInboxMessagesForSync` API| Get inbox messages for saved channels        | ✅     |
| `deleteInboxMessages` API    | Delete synced messages from inbox            | ✅     |
| PoW challenge APIs           | Per-message spam prevention                  | ✅     |
| Channel list UI              | Messages tab interface                       | ✅     |
| Channel detail UI            | Message thread view                          | ✅     |
| New message dialog           | Compose and send new messages                | ✅     |
| Compose box                  | Reply to messages with PoW                   | ✅     |

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

- [x] Update `engagement_key` table with `purpose` and `counterparty_pubkey` fields
- [x] Add `channel_view` table to PostgreSQL
- [x] Add `inbox_message` table to PostgreSQL
- [x] Create Drizzle models (`channel.ts`, `inbox-message.ts`)
- [x] Note: NO outbox table - sent messages saved to sender's vault via secret_update
- [x] `getEngagementKeyForSending` - Create engagement key with purpose "send"
- [x] `getCounterpartyEngagementKey` - Public endpoint; accepts sender's pubkey,
      creates key with purpose "receive", stores sender's pubkey for validation
- [x] `sendMessage` - Send message with PoW; validates engagement key metadata
      (purpose, counterpartyAddress, counterpartyPubKey) before accepting
- [x] `getChannels` - List channels for an address (with pagination, reverse chronological)
- [x] `getChannelMessages` - Get messages in a channel (reverse chronological order)
- [x] `updateChannelStatus` - Accept/ignore channel
- [x] Unit tests for channel and inbox-message models
- [x] Integration test setup with vitest globalSetup (single `pnpm test` command)

### Phase 2: Client Integration - COMPLETE

- [x] ECDH shared secret computation (`@keypears/lib` - `ecdhSharedSecret`)
- [x] Message encryption/decryption (`message-encryption.ts`)
- [x] Channel list UI (`vault.$vaultId.messages._index.tsx`)
- [x] New message flow with PoW (`new-message-dialog.tsx`)
- [x] Channel detail/thread view (`vault.$vaultId.messages.$channelId.tsx`)
- [x] Compose box with PoW mining (`compose-box.tsx`)

### Phase 3: Vault Integration - COMPLETE

- [x] Messages page queries server API (pending/ignored) or local vault (saved)
- [x] Passwords page filters `type !== "message"` via `excludeTypes` option
- [x] Status toggle on channels (Save/Pending/Ignore buttons)
- [x] Auto-sync: `syncInboxMessages()` moves inbox messages to vault for saved channels
- [x] Server-generated `secretId` in `channel_view` ensures consistency across devices
- [x] Sender saves messages to vault immediately after sending
- [x] Auto-save on reply: replying to pending/ignored channel automatically saves it
- [x] `getSenderChannel` API creates sender's channel_view with status "saved"
- [x] `getInboxMessagesForSync` / `deleteInboxMessages` APIs for sync process

### Phase 4: Attachments (Future)

- [ ] Password attachment type
- [ ] Secret sharing via messages
- [ ] Future: file attachments

## Related Documentation

- [Diffie-Hellman Protocol](./dh.md) - Federated DH key exchange protocol
- [Vault Keys](./vault-keys.md) - Vault key architecture
- [Key Derivation Functions](./kdf.md) - Password-based key derivation
