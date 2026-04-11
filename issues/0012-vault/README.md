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

- Plaintext metadata: name, type
- Encrypted fields: domain, username, email, password, notes
- Example: "Google" → { domain: "google.com", email: "me@gmail.com", password:
  "hunter2" }

**`text`** — Generic secret text. Catch-all for anything that doesn't fit a
structured type. API keys, tokens, license keys, one-off secrets, secure notes.

- Plaintext metadata: name, type
- Encrypted fields: text
- Example: "OpenAI API Key" → { text: "sk-proj-abc123..." }

These two cover the vast majority of use cases. More types can be added later
without schema changes, since the type just determines which fields the UI
renders — the encrypted blob is always freeform JSON.

### Future types (not this issue)

- **`card`** — Credit/debit card (number, expiry, CVV, cardholder name)
- **`crypto`** — Cryptocurrency key (address, private key, seed phrase, network)
- **`ssh`** — SSH key (public key, private key, passphrase, host)
- **`env`** — Environment variable (key, value, environment)

Adding a new type is purely a UI concern: define which fields to show in the
create/edit form, add an icon, done. The storage layer doesn't change.

## Storage design

### Plaintext vs encrypted split

```
Server stores:
┌──────────────────────────────────────────────────────────┐
│ id                                                       │
│ userId                                                   │
│ name            ← plaintext (searchable)                 │
│ type            ← plaintext ("login" | "text" | ...)     │
│ encryptedData   ← ACS2 ciphertext (opaque to server)     │
│ loginKeyHash    ← identifies which password encrypted it │
│ createdAt                                                │
│ updatedAt                                                │
└──────────────────────────────────────────────────────────┘

Encrypted blob contains (after decryption):
┌──────────────────────────────────────────────────────────┐
│ For type "login":                                        │
│   { domain?, username?, email?, password?, notes? }      │
│                                                          │
│ For type "text":                                         │
│   { text }                                               │
│                                                          │
│ Future types add their own fields here.                  │
└──────────────────────────────────────────────────────────┘
```

The name is the only user-visible datum stored in plaintext. This enables
server-side search (LIKE queries on name) without exposing secrets. Users should
be aware that entry names are visible to the server operator, same as how email
subject lines are visible to the mail server.

### Schema

```sql
vault_entries (
  id              binary(16) PK     -- UUIDv7
  user_id         binary(16) NOT NULL
  name            varchar(255) NOT NULL
  type            varchar(32) NOT NULL
  encrypted_data  text NOT NULL
  login_key_hash  varchar(255)
  created_at      timestamp NOT NULL DEFAULT NOW()
  updated_at      timestamp NOT NULL DEFAULT NOW()

  INDEX (user_id)
)
```

### Encryption model

Vault entries are encrypted with the user's **encryption key** — the same key
used to encrypt secp256k1 private keys. This key is derived from the password
via three-tier BLAKE3 PBKDF and cached in localStorage.

- **Create**: client encrypts fields → sends name + type + ciphertext to server
- **Read**: server returns name + type + ciphertext → client decrypts
- **Update**: client encrypts new fields → sends to server
- **Delete**: server deletes the row (hard delete, not tombstone)
- **Search**: server filters by name (LIKE), client gets results with ciphertext

### Key rotation

When a user changes their password, vault entries are re-encrypted with the new
encryption key, same pattern as `user_keys`. Each entry tracks `loginKeyHash` to
identify which password encrypted it. Entries encrypted with a different
password show as "locked" — same UX as the Keys page.

The password change flow in `password.tsx` already re-encrypts `user_keys`.
Vault entries follow the exact same pattern: fetch all entries, decrypt those
matching current password, re-encrypt with new key, send back.

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
3. Encrypts the fields with the user's own encryption key
4. Saves to their vault via the create endpoint

The secret is now in their vault, independent of the message.

## Scope

### Must have (Experiment 1)

- `vault_entries` table in schema
- Server CRUD for vault entries (create, list, get, update, delete, search)
- Vault page: list entries with search, create new, view/edit, delete
- Support `login` and `text` types with appropriate field UIs
- Copy to clipboard, show/hide secret fields
- Entries encrypted client-side with encryption key
- Re-encrypt vault entries on password change

### Must have (Experiment 2)

- New message type `"secret"` in the message content schema
- Channel view: render secret messages with masked fields, copy buttons
- "Save to vault" button on received secrets
- Ability to send a vault entry as a message from the channel view

### Future (not this issue)

- Additional types (card, crypto, ssh, env)
- Browser extension for autofill
- Import/export (1Password CSV, etc.)
- Vault folders/tags/organization
- Generated passwords
