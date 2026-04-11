+++
status = "open"
opened = "2026-04-11"
+++

# Vault — Encrypted Password Manager

## Goal

Build a vault that lets users store passwords, API keys, and other secrets,
encrypted client-side with their KeyPears encryption key. Integrate the vault
with messaging so users can send and receive secrets as easily as text messages.

## Background

The vault is the core reason KeyPears exists. It's not just an encrypted
messenger — it's an encrypted messenger _of secrets_. The top competitor is
1Password, but 1Password has no federated architecture. KeyPears lets any
organization run their own server, own their own data, and still share secrets
across domains.

### What makes this different from 1Password

- **Federated**: secrets stay on the user's server, not a central cloud.
- **Built on messaging**: sending a password to someone is just sending a
  message. No separate "sharing" concept — it's a conversation.
- **PoW-gated**: sharing secrets requires proof of work, just like all KeyPears
  messages. This prevents spam and brute-force enumeration.
- **No master unlock**: the encryption key is derived client-side from the
  user's password. The server never sees it. There is no "recovery" — you lose
  your password, you lose your vault.

### How kp1 solved this

kp1 supported 6 types: `password`, `envvar`, `apikey`, `walletkey`, `passkey`,
`message`. In practice, only `password` was used in the UI. The server stored
**zero plaintext metadata** — everything was in the encrypted blob. The client
(a Tauri desktop app with SQLite) decrypted and cached metadata locally for
search. The search bar was rendered but disabled/unimplemented.

KeyPears v2 is a web app with no local database. Storing zero metadata on the
server means no server-side search, which means loading and decrypting every
entry on every page load. That doesn't scale. The design below stores **name and
type as plaintext** on the server. The server can see "Google Login" and "login"
but never the username, password, or any field values.

## Entry types

### Starting types

**`login`** — Username/password for websites and services.

- Plaintext metadata: name, type, searchTerms
- Encrypted fields: domain, username, email, password, notes
- Example: "Google" with searchTerms "gmail work" → { domain: "google.com",
  email: "me@gmail.com", password: "hunter2" }

**`text`** — Generic secret text. Catch-all for anything that doesn't fit a
structured type. API keys, tokens, license keys, one-off secrets, secure notes.

- Plaintext metadata: name, type, searchTerms
- Encrypted fields: text
- Example: "OpenAI API Key" with searchTerms "ai gpt" → { text:
  "sk-proj-abc123..." }

These two cover the vast majority of use cases. More types can be added later
without schema changes, since the type just determines which fields the UI
renders.

### Future types (not this issue)

- **`card`** — Credit/debit card (number, expiry, CVV, cardholder name)
- **`crypto`** — Cryptocurrency key (address, private key, seed phrase, network)
- **`ssh`** — SSH key (public key, private key, passphrase, host)
- **`env`** — Environment variable (key, value, environment)

Adding a new type is purely a UI concern: define which fields to show in the
create/edit form, add an icon, done. The storage layer doesn't change.

## Encryption model

### Vault key = user's secp256k1 private key

Each user already has secp256k1 key pairs in `user_keys`, with a `keyNumber`
(integer starting at 1, incrementing on each rotation). The vault reuses this
system: the user's private key is the vault key.

To avoid using the same key material for both ECDH messaging and symmetric vault
encryption, derive a domain-separated symmetric key:

```
vaultKey = blake3Mac(privateKey, "vault-key")  →  32-byte ACS2 key
```

Each vault entry stores the `publicKey` it was encrypted with. The UI looks up
the corresponding `keyNumber` to display "Key #3" etc.

### No re-encryption on key rotation

Key rotation works the same way as messages — instant, zero friction:

- New vault entries are encrypted with the **active key** (latest key).
- Old entries stay encrypted with whatever key was used. They're still readable
  because old keys persist in `user_keys`.
- Each entry shows its key number (e.g. "Key #2"). If the active key is #4, the
  user can see that entry #2 is on an older key.
- To upgrade a single entry: decrypt with old key, re-encrypt with active key,
  save. User-initiated, one at a time. No batch migration.
- Entries encrypted with a **locked key** (different password) show as locked —
  same UX as messages.

This means:

- Key rotation is instant and cheap. No vault friction.
- Password change re-encrypts `user_keys` (which hold the private keys). Vault
  entries themselves don't need re-encryption — they're encrypted with the
  derived vault key, not the password-derived encryption key.
- The vault page uses the same key-loading pattern as the channel page: load all
  user keys, decrypt them, build a key map keyed by `publicKey`.

### Password change flow

When a user changes their password:

1. `user_keys` are re-encrypted (existing flow — old encryption key → new).
2. Vault entries are **untouched**. They're encrypted with derived vault keys,
   not the encryption key. As long as the user's private keys are accessible
   (re-encrypted in step 1), vault entries remain readable.

### Key compromise

If a key is compromised, the user rotates to a new key. Old vault entries remain
encrypted with the compromised key until the user manually re-encrypts them with
the new key. A "re-encrypt with current key" button on each entry handles this.

## Storage design

### Plaintext vs encrypted split

```
Server stores:
┌──────────────────────────────────────────────────────────┐
│ id                                                       │
│ userId                                                   │
│ name            ← plaintext (searchable)                 │
│ type            ← plaintext ("login" | "text" | ...)     │
│ searchTerms     ← plaintext (searchable, user-chosen)    │
│ publicKey       ← which key encrypted this entry         │
│ encryptedData   ← ACS2 ciphertext (opaque to server)     │
│ createdAt                                                │
│ updatedAt                                                │
└──────────────────────────────────────────────────────────┘

Encrypted blob contains (after decryption, Zod-validated):
┌──────────────────────────────────────────────────────────┐
│ For type "login":                                        │
│   { type: "login", domain?, username?, email?,           │
│     password?, notes? }                                  │
│                                                          │
│ For type "text":                                         │
│   { type: "text", text }                                 │
│                                                          │
│ Future types add their own discriminant here.            │
└──────────────────────────────────────────────────────────┘
```

Name and search terms are the only user-visible data stored in plaintext. This
enables server-side search (LIKE queries on name and searchTerms) without
exposing secrets. Users control what goes in search terms — they might add
"gmail", "work", "production" without revealing credentials. Users should be
aware that names and search terms are visible to the server operator, same as
how email subject lines are visible to the mail server.

### Schema

```sql
vault_entries (
  id              binary(16) PK       -- UUIDv7
  user_id         binary(16) NOT NULL
  name            varchar(255) NOT NULL
  type            varchar(32) NOT NULL
  search_terms    varchar(255) NOT NULL DEFAULT ''
  public_key      varchar(66) NOT NULL  -- which key encrypted this
  encrypted_data  text NOT NULL
  created_at      timestamp NOT NULL DEFAULT NOW()
  updated_at      timestamp NOT NULL DEFAULT NOW()

  INDEX (user_id)
)
```

### Encrypted blob validation

The encrypted blob is validated client-side with Zod after decryption. The
`type` field inside the blob is authoritative — the plaintext `type` column on
the server is for search/filtering only. If they disagree, trust the blob.

```typescript
const LoginFields = z.object({
  type: z.literal("login"),
  domain: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
  notes: z.string().optional(),
});

const TextFields = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const VaultEntryData = z.discriminatedUnion("type", [
  LoginFields,
  TextFields,
]);
```

If validation fails — corrupted data, a future type the current client doesn't
understand, or a manually crafted blob — the UI shows a fallback: "Unable to
display — show raw data" with the decrypted JSON. Nothing is lost; the user can
still see what's there.

No `loginKeyHash` needed — the entry tracks `publicKey`, and the corresponding
private key in `user_keys` tracks its own `loginKeyHash`. One level of
indirection handles both key rotation and password changes.

### CRUD operations

- **Create**: derive vault key from active private key → encrypt fields → send
  name + type + searchTerms + publicKey + ciphertext to server
- **Read**: server returns metadata + ciphertext → find matching private key →
  derive vault key → decrypt
- **Update**: decrypt with old key → re-encrypt with same key (or active key if
  upgrading) → send to server
- **Delete**: server deletes the row (hard delete)
- **Search**: server filters by name and searchTerms (LIKE on both), returns
  results with ciphertext

## Message integration

### Message protocol extension

The existing message content schema uses `{ version, type, text }` where `type`
is `"text"`. Vault secrets introduce a new type:

```json
{
  "version": 1,
  "type": "secret",
  "secret": {
    "name": "Production DB",
    "secretType": "login",
    "fields": {
      "domain": "db.example.com",
      "username": "admin",
      "password": "hunter2",
      "notes": "Rotated monthly"
    }
  }
}
```

The `secretType` tells the recipient UI how to render the fields. The `fields`
object matches the encrypted blob structure for that type.

### Saving received secrets

When a user receives a secret message, the channel view renders it with a "Save
to vault" button. Clicking it:

1. Decrypts the message (ECDH shared secret — already done for display)
2. Extracts the secret payload (name, secretType, fields)
3. Derives vault key from active private key
4. Encrypts the fields with the vault key
5. Saves to their vault via the create endpoint

The secret is now in their vault, independent of the message.

## Vault page UX

### Routing

Two routes, same pattern as inbox/channel:

- **`/vault`** — full-screen entry list (search + entries, sorted by updatedAt
  desc). "New Entry" button. Clicking an entry navigates to its detail page.
- **`/vault/:id`** — split layout like `channel.$address.tsx`:
  - **Desktop**: fixed left panel (search + entry list), detail on the right
  - **Mobile**: burger menu opens a drawer with search + entry list, detail
    fills the screen
  - Clicking "Vault" in the sidebar goes back to the full list

### Entry list (sidebar panel and full page)

- Search input at top (debounced, server-side LIKE on name and search terms)
- Entries sorted by updatedAt desc (recently changed first)
- Each entry shows: name, type icon (KeyRound for login, FileText for text)
- Active entry highlighted in the side panel (like active channel)
- Entries with locked keys show lock icon

### Entry detail (`/vault/:id`)

- Name, search terms, type-specific fields
- Secret fields (password, etc.) masked by default. Eye icon to toggle.
- Copy button on each field value
- Edit button → inline edit mode
- Save button (encrypts and updates)
- Delete button with confirmation
- Key number shown. If not active key, show "encrypted with Key #N"

### Create entry

- Accessed via "New Entry" button on the vault list
- Type selector (Login / Text)
- Name (required), search terms (optional)
- Type-specific fields
- Save → encrypts with active key, creates entry, navigates to it

## Scope

### Must have (Experiment 1)

- `vault_entries` table in schema
- Server CRUD for vault entries (create, list, get, update, delete, search)
- Vault page: list entries with search, create new, view/edit, delete
- Support `login` and `text` types with appropriate field UIs
- Copy to clipboard, show/hide secret fields
- Encryption with derived vault key from active secp256k1 private key
- Key number display on each entry
- Locked entries for keys under different password

### Must have (Experiment 2)

- New message type `"secret"` in the message content schema
- Channel view: render secret messages with masked fields, copy buttons
- "Save to vault" button on received secrets
- Ability to send a vault entry as a message from the channel view

### Future (not this issue)

- Re-encrypt entry with newer key (upgrade encryption)
- Additional types (card, crypto, ssh, env)
- Browser extension for autofill
- Import/export (1Password CSV, etc.)
- Vault folders/tags/organization
- Generated passwords

## Experiments

### Experiment 1: Vault CRUD with client-side encryption

#### Description

Build the vault from schema to UI. Users can create, view, edit, search, and
delete encrypted vault entries. Entries are encrypted with a key derived from
the user's secp256k1 private key. Support `login` and `text` entry types.

#### Schema

Add to `webapp/src/db/schema.ts`:

```typescript
export const vaultEntries = mysqlTable(
  "vault_entries",
  {
    id: binaryId("id").primaryKey(),
    userId: binaryId("user_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    searchTerms: varchar("search_terms", { length: 255 }).notNull().default(""),
    publicKey: varchar("public_key", { length: 66 }).notNull(),
    encryptedData: text("encrypted_data").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("vault_user_id_idx").on(table.userId)],
);
```

#### Server logic — `webapp/src/server/vault.server.ts`

```typescript
createVaultEntry(userId, name, type, searchTerms, publicKey, encryptedData)
getVaultEntries(userId, query?, beforeId?)  // LIKE on name/search_terms, cursor pagination
getVaultEntry(userId, entryId)
updateVaultEntry(userId, entryId, name, type, searchTerms, publicKey, encryptedData)
deleteVaultEntry(userId, entryId)
```

All functions scope queries by `userId` — users can only access their own
entries. Search uses `WHERE (name LIKE ? OR search_terms LIKE ?)` with `%`
wrapping.

#### Server functions — `webapp/src/server/vault.functions.ts`

```typescript
createEntry    — POST, Zod input: { name, type, searchTerms, publicKey, encryptedData }
getMyEntries   — GET, optional query string for search, optional beforeId for pagination
getEntry       — GET, input: entry ID
updateEntry    — POST, Zod input: { id, name, type, searchTerms, publicKey, encryptedData }
deleteEntry    — POST, input: entry ID

MAX_ENCRYPTED_DATA_LENGTH = 20,000 hex chars (~10KB). Validated in Zod input
schemas for both createEntry and updateEntry. Vault entries are for secrets
(passwords, API keys, SSH keys, seed phrases) — not files. To store a large
file, encrypt it with a key and store the key in KeyPears.
```

All require `requireSessionUserId()`.

#### Client crypto — `webapp/src/lib/vault.ts`

```typescript
import { blake3Mac } from "@webbuf/blake3";
import { acs2Encrypt, acs2Decrypt } from "@webbuf/acs2";
import { z } from "zod";

// --- Vault key derivation ---

function deriveVaultKey(privateKey: FixedBuf<32>): FixedBuf<32> {
  return blake3Mac(privateKey, WebBuf.fromUtf8("vault-key"));
}

// --- Blob schemas ---

const LoginFields = z.object({
  type: z.literal("login"),
  domain: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
  notes: z.string().optional(),
});

const TextFields = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const VaultEntryData = z.discriminatedUnion("type", [LoginFields, TextFields]);
type VaultEntryData = z.infer<typeof VaultEntryData>;

// --- Encrypt / decrypt ---

function encryptVaultEntry(data: VaultEntryData, privateKey: FixedBuf<32>): string
function decryptVaultEntry(hex: string, privateKey: FixedBuf<32>): VaultEntryData
// Returns null instead of throwing if Zod validation fails
function tryDecryptVaultEntry(hex: string, privateKey: FixedBuf<32>):
  VaultEntryData | { raw: string }
```

#### UI — Routes

**`webapp/src/routes/_app/_saved/_chrome/vault.tsx`** — full-screen vault list.

- Replace the placeholder
- Search input (debounced, calls `getMyEntries` with query)
- "New Entry" button → create form (inline or modal)
- Entry cards sorted by updatedAt desc: name, type icon (KeyRound for login,
  FileText for text). Locked entries show lock icon.
- Load 20 entries at a time. "Show more" button at bottom fetches next batch
  (cursor-based pagination on id, same pattern as channel messages).
- Click an entry → navigate to `/vault/:id`

**`webapp/src/routes/_app/_saved/vault.$id.tsx`** — entry detail with split
layout (same pattern as `channel.$address.tsx`).

- **Left panel** (desktop: fixed, mobile: drawer behind burger menu):
  - Search input + entry list, same as vault page
  - Active entry highlighted
- **Right panel**: entry detail
  - View mode: name, search terms, type-specific fields
  - Secret fields masked, eye toggle, copy buttons
  - Edit button → inline edit. Save re-encrypts and updates.
  - Delete button with confirmation
  - Key number badge if not active key

Note: `vault.$id.tsx` is under `_saved/` (not `_saved/_chrome/`) so it gets the
full-screen split layout without the sidebar, same as channel pages.

**Key loading** follows the same pattern as `channel.$address.tsx`:

- On mount, load all user keys via `getMyKeys()`
- Decrypt private keys using cached encryption key
- Build a map of `publicKey → privateKey`
- For each vault entry, look up its `publicKey` in the map to decrypt

#### Verification

1. `bun run db:clear && bun run db:push` — creates vault_entries table
2. Create a login entry (e.g. "Google", domain google.com, password hunter2)
3. Entry appears in vault list, encrypted on server
4. Click entry → fields display, password masked. Toggle show. Copy works.
5. Edit entry → change password → save. Verify re-encrypted correctly.
6. Search "goo" → returns Google entry. Search "xyz" → empty.
7. Delete entry → gone from list and database.
8. Create a text entry (e.g. "OpenAI API Key"). Same CRUD flow works.
9. Rotate key on Keys page → new entries use new key. Old entries still readable
   with old key. Key number badge shows correctly.
10. `bun run test` — existing tests pass
11. `bun run lint` — no warnings

#### Result: Pass

Vault CRUD works end-to-end. Entries are encrypted client-side with a
domain-separated key derived from the user's secp256k1 private key. Search,
pagination, create, edit, delete, show/hide, copy — all functional. Split layout
detail page mirrors the channel view pattern. Lint clean, build passes.

### Experiment 2: Secret sharing via messages

#### Description

Add the ability to share vault entries via encrypted messages and save received
secrets to your vault.

#### Message protocol

Extend the message content schema with a `"secret"` type:

```typescript
const MessageContentSchema = z.discriminatedUnion("type", [
  z.object({ version: z.number(), type: z.literal("text"), text: z.string() }),
  z.object({
    version: z.number(),
    type: z.literal("secret"),
    secret: z.object({
      name: z.string(),
      secretType: z.string(),  // "login" | "text"
      fields: z.record(z.string()),
    }),
  }),
]);
```

The `fields` object matches the vault encrypted blob structure. When sent as a
message, the entire content (including secret fields) is encrypted with the
ECDH shared secret, same as text messages. No vault key involved in transit.

#### Share flow (sender)

1. On vault entry detail page, add a **Share** button (Send icon) next to
   Edit and Delete.
2. Click Share → enter a KeyPears address (inline input or small modal).
3. Decrypt the vault entry using the vault key.
4. Encrypt as a `"secret"` message using ECDH shared secret with recipient.
5. Send via existing `sendMessage` flow (PoW required).
6. Message appears in the channel as a secret card.

#### Receive flow (recipient)

1. Channel view renders `"secret"` messages as a card: name, type icon
   (KeyRound for login, FileText for text), "Save to Vault" button.
2. No preview of fields — the card just shows the name and type.
3. Click "Save to Vault":
   a. Decrypt the message (ECDH — already done for display).
   b. Extract the secret payload (name, secretType, fields).
   c. Encrypt with the recipient's vault key (derived from active private key).
   d. Save to vault via `createEntry`.
   e. Navigate to `/vault/$id` for the new entry.
4. Duplicates are allowed — saving the same secret twice creates two entries.

#### Changes

**`webapp/src/lib/message.ts`**:
- Extend `MessageContentSchema` to support `"secret"` type via discriminated
  union.
- Update `decryptMessage` to return the parsed content object (not just text).
- Add `encryptSecretMessage` and `decryptMessageContent` functions.

**`webapp/src/routes/_app/_saved/channel.$address.tsx`**:
- Update message rendering: if message type is `"secret"`, render a secret
  card with name, type icon, and "Save to Vault" button.
- "Save to Vault" handler: decrypt, re-encrypt with vault key, save, navigate.
- Text messages render as before.

**`webapp/src/routes/_app/_saved/vault.$id.tsx`**:
- Add Share button to entry detail header (next to Edit/Delete).
- Share form: KeyPears address input, send button.
- Share handler: decrypt vault entry, encrypt as secret message, send via
  existing sendMessage flow with PoW.

#### Verification

1. `bun run build` — passes
2. `bun run lint` — clean
3. Open vault entry → click Share → enter recipient address → PoW → sent
4. Recipient sees secret card in channel: name, type, "Save to Vault" button
5. Click "Save to Vault" → entry saved → navigates to vault detail page
6. Saved entry matches original (same name, type, fields)
7. Save the same secret again → creates a second copy
8. Text messages still render and work normally

#### Result: Fail

Secret messages send but display as "unable to decrypt this message" on both
sender and recipient channels. No browser errors visible. The message is stored
in the database but cannot be decrypted by the channel view.

Root cause: Zod v4's `z.record()` requires two arguments (key + value schema).
`z.record(z.string())` created a malformed schema that crashed at parse time
with `Cannot read properties of undefined (reading '_zod')`. Fixed with
`z.record(z.string(), z.string())`.

Also replaced `z.discriminatedUnion` / `z.union` with manual type dispatch:
parse envelope first (`{ version, type }`), then validate type-specific content
with individual Zod schemas. No unions needed.

#### Result: Pass (after fix)

Secret sharing works end-to-end. Share button on vault entry detail sends
encrypted secret message via ECDH. Recipient sees secret card in channel with
name, type icon, and "Save to Vault" button. Saving decrypts ECDH message,
re-encrypts with vault key, creates entry, navigates to vault detail.
Text messages continue to work normally.

### Experiment 3: Secret provenance and save deduplication

#### Description

Track where each vault entry came from: created by the user, or received from
someone via a message. Show "Saved" instead of the green "Save to Vault" button
when a secret message has already been saved. Show the source on the vault
entry detail page.

#### Schema changes

Add two columns to `vault_entries`:

```typescript
sourceMessageId: varchar("source_message_id", { length: 36 }),
sourceAddress: varchar("source_address", { length: 255 }),
```

Both nullable. Null means the user created the entry themselves. Non-null means
it was saved from a received message.

Add a LEFT JOIN to message queries so each message knows if it's been saved.

#### Server changes

**`vault.server.ts`** — `createVaultEntry` accepts optional `sourceMessageId`
and `sourceAddress`.

**`vault.functions.ts`** — `createEntry` Zod input adds optional
`sourceMessageId` and `sourceAddress`.

**`message.server.ts`** — `getChannelMessages`, `getNewMessages` gain a
`userId` parameter. LEFT JOIN with `vault_entries` on
`sourceMessageId = messages.id AND userId = ?`. Return `isSaved` boolean per
message.

**`message.functions.ts`** — pass `userId` through to message query functions.

#### Channel view changes

**`channel.$address.tsx`**:
- Each message now has `isSaved` from the server.
- Secret messages: if `isSaved`, show "Saved" (grayed out text) instead of the
  green "Save to Vault" button.
- `handleSaveSecret` passes `sourceMessageId: msg.id` and
  `sourceAddress: msg.senderAddress` to `createEntry`.
- After saving, update the local message list to reflect `isSaved = true`
  without a full refetch.

#### Vault detail changes

**`vault.$id.tsx`**:
- Entry detail shows provenance below the header:
  - Self-created entries: nothing (or "Created by you")
  - Received entries: "Received from alice@keypears.com" as a Link to
    `/channel/alice@keypears.com`

#### Verification

1. `bun run db:clear && bun run db:push` — schema updated
2. Create a vault entry manually — `sourceMessageId` and `sourceAddress` are
   null
3. Receive a secret message — "Save to Vault" button is green
4. Save it — button changes to "Saved", vault entry shows
   "Received from sender@domain"
5. Navigate away and back to the channel — "Saved" persists (from LEFT JOIN)
6. Click "Received from sender@domain" — navigates to the channel
7. Text messages unaffected
8. `bun run lint` — clean
9. `bun run build` — passes
