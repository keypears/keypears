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
messenger — it's an encrypted messenger *of secrets*. The top competitor is
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

### Encryption model

Vault entries are encrypted with the user's **encryption key** (the same key
used to encrypt secp256k1 private keys). This key is derived from the password
via three-tier BLAKE3 PBKDF and cached in localStorage. The server stores only
ciphertext.

When a user sends a secret via message, the secret is encrypted with the ECDH
shared secret (same as text messages). The recipient can then save the received
secret to their own vault, where it gets re-encrypted with their own encryption
key.

### Message protocol extension

The existing message content schema uses `{ version, type, text }` where `type`
is `"text"`. Vault secrets introduce a new type:

```json
{
  "version": 1,
  "type": "secret",
  "secret": {
    "name": "Production DB",
    "fields": [
      { "name": "username", "value": "admin" },
      { "name": "password", "value": "hunter2", "secret": true },
      { "name": "host", "value": "db.example.com" },
      { "name": "notes", "value": "Rotated monthly", "multiline": true }
    ]
  }
}
```

The `fields` array is flexible — any number of named key-value pairs. The
`secret` flag on a field means it should be masked by default in the UI (like
password dots). The `multiline` flag means the field should render as a
textarea.

### Vault entry storage

Each vault entry is stored as an encrypted blob on the server, tied to the
user. The schema:

- **vault_entries**: id, userId, encryptedData (ACS2-encrypted JSON),
  loginKeyHash (identifies which password encrypted it), createdAt, updatedAt

The encrypted payload contains the same `{ name, fields }` structure as the
message secret. This means saving a received secret is just decrypting it
from the message and re-encrypting it with the user's own key.

### Vault entry metadata

The entry name is stored in plaintext alongside the ciphertext so users can
search and sort their vault without decrypting every entry. Only the name is
plaintext — all field names and values are encrypted.

### Key rotation

When a user changes their password, vault entries are re-encrypted with the
new encryption key (same as user_keys). Entries encrypted with a different
password show as "locked" — same UX pattern as the Keys page.

## Scope

### Must have (Experiment 1)

- `vault_entries` table in schema
- Server CRUD for vault entries (create, list, get, update, delete)
- Vault page: list entries, create new, view/edit, delete
- Each entry: name + flexible fields (copy to clipboard, show/hide secrets)
- Entries encrypted client-side with encryption key

### Must have (Experiment 2)

- New message type `"secret"` in the message content schema
- Send page: option to send a secret (instead of text)
- Channel view: render secret messages with masked fields, copy buttons
- "Save to vault" button on received secrets

### Future (not this issue)

- Browser extension for autofill
- Import/export (1Password CSV, etc.)
- Vault entry sharing with multiple recipients
- Vault folders/tags/organization
- Generated passwords
