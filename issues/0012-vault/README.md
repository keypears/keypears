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
│ encryptedData   ← ACS2 ciphertext (opaque to server)    │
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
│ Future types add their own discriminant here.             │
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

### Entry list

- Search bar at top (filters by name and search terms, server-side LIKE)
- Each entry shows: name, type icon, key number badge
- Key number badge is subtle (e.g. "Key #2") — if it's not the active key, show
  a small indicator that encryption can be upgraded
- Entries with locked keys (password mismatch) show a lock icon with "unlock on
  Keys page" link, same as messages

### Entry detail

- View mode: name, all fields. Secret fields (password, etc.) masked by default
  with show/hide toggle.
- Copy button on each field value.
- Edit button → edit mode with same fields.
- "Re-encrypt with Key #N" button if entry uses an older key.
- Delete button with confirmation.

### Create entry

- Type selector: Login or Text
- Name field (required)
- Type-specific fields (Login: domain, username, email, password, notes. Text:
  text area)
- Encrypted and saved on submit

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
