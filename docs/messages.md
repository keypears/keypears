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

### Opening a Channel

When Bob wants to message Alice for the first time:

```
1. RESOLVE: Bob resolves alice@example.com
   → Fetch https://example.com/.well-known/keypears.json
   → Confirm alice exists via API

2. GET KEYS: Bob establishes DH relationship
   → Get/create Bob's engagement key for Alice (from Bob's server)
   → Get Alice's engagement key for Bob (from Alice's server)
   → Compute shared secret via ECDH

3. GET CHALLENGE: Bob requests PoW challenge from Alice's server
   → Alice's server returns challenge with Alice's configured difficulty
   → Default difficulty: ~4 million (same as registration)

4. SOLVE PoW: Bob's client mines the solution
   → WebGPU or WASM, same as registration
   → Grants 1 message credit

5. OPEN CHANNEL: Bob submits channel open request
   → Includes: PoW proof, Bob's engagement pubkey, encrypted "hello" message
   → Alice's server creates channel record with 1 credit

6. DEPOSIT MESSAGE: Bob's message is now in Alice's inbox
   → Encrypted with shared secret
   → Alice's server cannot read content
```

### Channel Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  BOB (initiator)                 ALICE (recipient)          │
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
│  5. Solve PoW (~4 seconds GPU)                              │
│     ↓                                                       │
│  6. Open channel + send first message                       │
│     ────────────────────────────────────→                   │
│                                  7. Channel appears in      │
│                                     Alice's "Pending"       │
│                                     ↓                       │
│                                  8. Alice accepts/ignores   │
│                                     ↓                       │
│                                  9. If accepts, can reply   │
│     ←────────────────────────────────                       │
│  10. Bob gets +1 credit (can reply free)                    │
│      ↓                                                      │
│  [Normal conversation continues...]                         │
│                                                             │
│  If Alice ignores:                                          │
│  - Bob's messages still delivered to inbox                  │
│  - Alice doesn't see them                                   │
│  - Bob doesn't know he's ignored                            │
│  - Bob must pay PoW for each additional message             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Key Exchange

### Engagement Keys via Derived Keys System

The infrastructure already exists:

- Bob's server generates a derived public key for Bob↔Alice relationship
- Alice's server generates a derived public key for Alice↔Bob relationship
- Neither party exposes their primary vault public key

**Flow:**

```
1. Bob requests his engagement key from his server (bob@example2.com)
   → Server uses elliptic curve addition to create Bob's derived pubkey for Alice

2. Bob requests Alice's engagement key from Alice's server (alice@example.com)
   → Alice's server creates Alice's derived pubkey for Bob

3. Both compute: shared_secret = ECDH(my_privkey, their_pubkey)
```

The derived keys table already tracks `counterpartyAddress` - we use it to bind
engagement keys to specific relationships.

### End-to-End Encryption

```
Bob sends message to Alice:

1. Bob computes: shared_secret = ECDH(bob_privkey, alice_pubkey)

2. Bob encrypts: encrypted_content = ACS2(message_content, shared_secret)

3. Bob sends to Alice's server:
   {
     channelId: "...",
     encryptedContent: "...",  // Server cannot read
     signature: "...",          // Bob signs with his engagement key
     timestamp: ...
   }

4. Alice retrieves from her server

5. Alice computes: same_shared_secret = ECDH(alice_privkey, bob_pubkey)

6. Alice decrypts: message_content = ACS2_decrypt(encrypted_content, shared_secret)
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

### PoW + Message Credits

| Action                       | Credit Change |
| ---------------------------- | ------------- |
| Open channel (requires PoW)  | +1            |
| Send message                 | -1            |
| Receive reply from recipient | +1            |

**Rules:**

- Cannot send with 0 credits
- To send another message without reply, must solve another PoW
- Normal back-and-forth conversation: free (credits balance)
- Spam attempt (10 messages in a row): costs 10 PoW solutions

**Recipient's controls:**

- Configurable PoW difficulty (default ~4M, can increase)
- "Ignore" channel: Sender never knows, but recipient doesn't see messages
- "Block" channel: Future enhancement, rejects at server level

**Server-side enforcement:**

- Credit tracking in database
- Reject messages when credits ≤ 0
- PoW verification before crediting

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

### Per-Participant Inbox

**Critical insight**: Each participant stores their OWN copy of messages.

```
Bob sends message to Alice:

1. Message goes to Alice's inbox (on Alice's server)
2. Message ALSO goes to Bob's outbox (on Bob's server)
3. Even if Alice and Bob are on SAME server → stored twice
```

**Why store twice?**

- Logical simplicity: each person owns their messages independently
- Alice can delete without affecting Bob's copy
- Bob can delete without affecting Alice's copy
- No complex coordination between participants
- Messages are small text, duplication is cheap

### Saving to Vault

**Inbox vs Vault:**

| Inbox (Layer 1)        | Vault (Layer 2)           |
| ---------------------- | ------------------------- |
| Server-side only       | Client-side + sync        |
| Ephemeral (30 days)    | Persistent                |
| All incoming messages  | Only saved messages       |
| No offline access      | Full offline access       |
| Not encrypted at rest  | Encrypted with vault key  |

**User flows:**

**Viewing messages:**

- User opens Messages tab
- Sees list of channels (contacts who have messaged them)
- Channels marked as "pending" until accepted
- Can view messages in a channel without saving

**Saving messages:**

- User can "Save Channel" → all messages copied to vault
- User can "Save Message" → single message copied to vault
- Saved = synced across devices, offline access

**Implementation:**

- Saved messages become `secret_update` records with `type: "message"`
- Channel ID becomes the `secretId` (all messages in a channel share it)
- Each message gets its own `localOrder` within the channel
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
- Each view stores only the owner's state (their credits, their sync preference)

**New table: `channel_view`** (each participant's view of a channel)

```sql
id                      UUIDv7 primary key
owner_address           text (e.g., "alice@example.com") -- who owns this view
counterparty_address    text (e.g., "bob@example2.com") -- who they're talking to
my_engagement_pubkey    varchar(66) (owner's 33-byte compressed secp256k1 public key)
their_engagement_pubkey varchar(66) (counterparty's public key, nullable until known)
role                    "initiator" | "recipient" (who opened the channel)
status                  "pending" | "accepted" | "ignored"
credits                 integer (owner's message credits)
saved_to_vault          boolean (owner's sync preference)
pow_challenge_id        FK → pow_challenge (only set for initiator)
created_at              timestamp
updated_at              timestamp
```

**Example**: When Bob opens a channel to Alice:

```
Bob's server creates:
┌─────────────────────────────────────────────┐
│ channel_view (owner: bob@example2.com)      │
│ counterparty: alice@example.com             │
│ role: "initiator"                           │
│ credits: 1 (from PoW)                       │
│ saved_to_vault: false                       │
└─────────────────────────────────────────────┘

Alice's server creates:
┌─────────────────────────────────────────────┐
│ channel_view (owner: alice@example.com)     │
│ counterparty: bob@example2.com              │
│ role: "recipient"                           │
│ credits: 0                                  │
│ saved_to_vault: false                       │
└─────────────────────────────────────────────┘
```

**Why actual public keys, not FK references?** Neither server knows the other's internal
`derived_key` IDs. The only globally-meaningful identifier is the actual public key,
which is what ECDH needs to compute the shared secret.

**New table: `inbox_message`**

```sql
id                       UUIDv7 primary key
channel_id               FK → channel
sender_address           text (e.g., "bob@example.com")
order_in_channel         integer (1, 2, 3, ...)
encrypted_content        text (ACS2 encrypted)
sender_engagement_pubkey text (for decryption - vault's current key)
is_read                  boolean
created_at               timestamp
expires_at               timestamp (30 days from created_at)
```

Note: We removed the separate `outbox_message` table for MVP simplicity.
Each message is stored once in the channel, accessible to both participants.

### Client-Side (SQLite)

**Extend existing `secret_update` table:**

- Add `type: "message"` support
- `secretId` = channel identifier
- `localOrder` = message order within channel
- `encryptedBlob` = message content

**New table: `contact`**

```sql
id                  UUIDv7 primary key
vault_id            FK → vault (my vault)
address             text (e.g., "bob@example.com")
engagement_key_id   text (derived key ID)
shared_secret       blob (cached, encrypted with vault key)
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
| Derived Keys        | Engagement keys for DH           |
| PoW (pow5-64b)      | Channel opening tax              |
| ACS2 encryption     | Message content encryption       |
| Secret Updates      | Storage for saved messages       |
| Sync infrastructure | Cross-device message sync        |

### New Components Needed

| Component              | Purpose                        |
| ---------------------- | ------------------------------ |
| Channel management API | Open/accept/ignore channels    |
| Message inbox API      | Deposit/retrieve messages      |
| Credit tracking        | Anti-spam enforcement          |
| Well-known discovery   | Resolve addresses to servers   |
| Channel UI             | Messages tab interface         |

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
- [x] Derived keys system with `counterpartyAddress` field
- [x] Messages UI placeholder route (`/vault/:vaultId/messages`)

### Phase 1: Server-Side Foundation - IN PROGRESS

- [ ] Add `channel` table to PostgreSQL (addresses, not vault IDs)
- [ ] Add `inbox_message` table to PostgreSQL
- [ ] Create Drizzle models (`channel.ts`, `inbox-message.ts`)
- [ ] `getEngagementKey` - Get/create derived key for counterparty
- [ ] `getCounterpartyEngagementKey` - Public endpoint (cross-domain)
- [ ] `openChannel` - Create channel with PoW + first message
- [ ] `sendMessage` - Send message (costs 1 credit)
- [ ] `getChannels` - List channels for an address
- [ ] `getChannelMessages` - Get messages in a channel
- [ ] `updateChannelStatus` - Accept/ignore channel
- [ ] `saveChannelToVault` - Toggle vault sync

### Phase 2: Client Integration

- [ ] ECDH shared secret computation (`@keypears/lib`)
- [ ] Message encryption/decryption (`message-encryption.ts`)
- [ ] Channel list UI (replace placeholder)
- [ ] New message flow with PoW
- [ ] Channel detail/thread view

### Phase 3: Vault Integration

- [ ] Messages page queries server API for all channels
- [ ] Passwords page filters `type !== "message"`
- [ ] "Save to vault" toggle on channels
- [ ] Auto-sync: saved channels create secret_updates
- [ ] Notifications via existing unread count system

### Phase 4: Attachments (Future)

- [ ] Password attachment type
- [ ] Secret sharing via messages
- [ ] Future: file attachments

## Related Documentation

- [Diffie-Hellman Protocol](./dh.md) - Federated DH key exchange protocol
- [Vault Keys](./vault-keys.md) - Vault key architecture
- [Key Derivation Functions](./kdf.md) - Password-based key derivation
