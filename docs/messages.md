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

### Engagement Keys System

The engagement key infrastructure enables secure DH key exchange:

- Each engagement key has a **purpose**: "send" or "receive"
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

### PoW + Message Credits

| Action                       | Credit Change |
| ---------------------------- | ------------- |
| Send message with PoW        | +1            |
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
status                  "pending" | "accepted" | "ignored"
credits                 integer (owner's message credits)
saved_to_vault          boolean (owner's sync preference)
min_difficulty          text (per-channel PoW override, null = use global setting)
created_at              timestamp
updated_at              timestamp
```

**Why no public keys in channel_view?** The channel is between two ADDRESSES, not two
public keys. Keys can change over time (rotation, fresh keys). Each MESSAGE carries the
public key(s) used at time of sending. The channel_view only stores the fixed relationship
metadata.

**Why no role field?** It doesn't matter who "initiated" the channel. What matters is
the current state: status, credits, and sync preference. The channel is symmetric.

**Example**: When Bob sends a message to Alice:

```
Bob's server creates:
┌─────────────────────────────────────────────┐
│ channel_view (owner: bob@example2.com)      │
│ counterparty: alice@example.com             │
│ credits: 0 (spent on sending)               │
│ saved_to_vault: false                       │
└─────────────────────────────────────────────┘

Alice's server creates:
┌─────────────────────────────────────────────┐
│ channel_view (owner: alice@example.com)     │
│ counterparty: bob@example2.com              │
│ status: "pending"                           │
│ credits: 0                                  │
│ saved_to_vault: false                       │
└─────────────────────────────────────────────┘
```

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

**New table: `outbox_message`** (messages I sent)

```sql
id                       UUIDv7 primary key
channel_view_id          FK → channel_view
recipient_address        text (e.g., "alice@example.com")
order_in_channel         integer (1, 2, 3, ...)
encrypted_content        text (ACS2 encrypted with ECDH shared secret)
my_engagement_pubkey     varchar(66) (which of my keys I used)
their_engagement_pubkey  varchar(66) (which of their keys I used)
created_at               timestamp
```

To decrypt my own outbox message: `sharedSecret = ECDH(myPrivKey, theirEngagementPubKey)`
(I need both pubkeys stored so I can re-derive the shared secret later)

**Why both inbox and outbox?**

- Inbox stores messages I received (with sender's pubkey for ECDH)
- Outbox stores messages I sent (with both pubkeys so I can decrypt my own messages later)
- Each participant maintains their own view of the conversation
- Alice's outbox message = Bob's inbox message (same content, different metadata)

**Updated table: `engagement_key`** (add fields for messaging validation)

The existing `engagement_key` table is extended with two new fields:

```sql
-- New fields added to engagement_key table:
purpose                  varchar(30) ("send" | "receive")
counterparty_pubkey      varchar(66) (other party's pubkey, for validation)
```

**Purpose field:**

- `"send"` - I created this key to send a message to counterparty
- `"receive"` - Counterparty requested this key to send me a message

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
| Engagement Keys     | Public keys for ECDH + validation|
| PoW (pow5-64b)      | Per-message spam prevention      |
| ACS2 encryption     | Message content encryption       |
| Secret Updates      | Storage for saved messages       |
| Sync infrastructure | Cross-device message sync        |

### New Components Needed

| Component              | Purpose                        |
| ---------------------- | ------------------------------ |
| Message send API       | Send messages with validation  |
| Message inbox API      | Retrieve messages              |
| Channel status API     | Accept/ignore channels         |
| Credit tracking        | Anti-spam enforcement          |
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
- [x] Engagement keys system with `counterpartyAddress` field
- [x] Messages UI placeholder route (`/vault/:vaultId/messages`)

### Phase 1: Server-Side Foundation - IN PROGRESS

- [ ] Update `engagement_key` table with `purpose` and `counterparty_pubkey` fields
- [ ] Add `channel_view` table to PostgreSQL
- [ ] Add `inbox_message` table to PostgreSQL
- [ ] Add `outbox_message` table to PostgreSQL
- [ ] Create Drizzle models (`channel.ts`, `message.ts`)
- [ ] `getEngagementKeyForSending` - Create engagement key with purpose "send"
- [ ] `getCounterpartyEngagementKey` - Public endpoint; accepts sender's pubkey,
      creates key with purpose "receive", stores sender's pubkey for validation
- [ ] `sendMessage` - Send message with PoW; validates engagement key metadata
      (purpose, counterpartyAddress, counterpartyPubKey) before accepting
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
