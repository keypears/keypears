+++
status = "open"
opened = "2026-04-07"
+++

# Issue 5: Domain Claiming via keypears.json

## Goal

Allow KeyPears users to claim custom domains and create user accounts under
those domains, without requiring email infrastructure. Domain ownership is
proven via the existing `keypears.json` well-known file.

## Background

Issue 0003 added multi-domain support to the database (domains table, users
scoped to domainId). Issue 0004 explored email sending for domain verification
but concluded that email is unnecessary — domain ownership can be proven with
HTTPS alone.

### How it works

1. A user (e.g. `ryan@keypears.com`) owns a domain (e.g. `ryanxcharles.com`).
2. They place a `keypears.json` file at
   `https://ryanxcharles.com/.well-known/keypears.json` containing:
   ```json
   {
     "apiDomain": "keypears.com",
     "admin": "ryan@keypears.com"
   }
   ```
3. In KeyPears, they click "Add a domain" and enter `ryanxcharles.com`.
4. KeyPears fetches the `keypears.json` file over HTTPS, verifying:
   - The file exists and is valid JSON.
   - The `apiDomain` matches this KeyPears server's domain.
   - The `admin` field matches the logged-in user's address.
5. The domain is added to the `domains` table with the user as admin.
6. The admin can now create user accounts under the domain (e.g.
   `alice@ryanxcharles.com`).
7. Those users log into `keypears.com` with their `@ryanxcharles.com` addresses.

### Trust model

- Domain ownership is proven by controlling the web server at that domain (same
  as TLS certificate issuance, same as federation discovery).
- The admin is an existing KeyPears user with a proven identity.
- No email, no DNS TXT records, no SMTP — just HTTPS.

### What needs to change

**Database:**

- Extend `domains` table with `adminUserId` (the KeyPears user who owns the
  domain) and `verified` status.
- The primary domain (from `KEYPEARS_DOMAIN`) has no admin — it's the server's
  own domain.

**`keypears.json` format:**

- Add optional `admin` field (string, full KeyPears address).
- Existing servers without `admin` continue to work (federation only).

**Server functions:**

- `claimDomain(domain)` — fetch keypears.json, verify admin matches current
  user, verify apiUrl matches this server, insert into domains table.
- `createDomainUser(domain, name, ...)` — admin creates a user under their
  domain. Similar to the existing registration flow but scoped to a domain.

**UI:**

- Domain management page (accessible to logged-in users).
- "Add a domain" form — enter domain name, server verifies.
- User list for each domain — admin can create/manage users.
- Login page — already accepts full `name@domain` addresses. No changes needed.

## Experiments

### Experiment 1: Per-key password management

#### Description

Before implementing domain claiming and admin-created accounts, we need the
system to handle keys encrypted under different passwords. Currently, all
keys are encrypted with one password and password change re-encrypts
everything atomically. This breaks when:

- An admin creates a user with an initial password (and key).
- The user changes their password — new keys use the new password, but old
  keys remain encrypted under the admin's password.
- An admin resets a user's password — same situation.
- A user forgets their old password — old keys are permanently locked unless
  they remember.

The fix: track which password encrypted each key, decrypt selectively, and
let users re-encrypt individual keys by entering the old password.

**Password generation model:**

Each user has a `passwordGeneration` counter (starts at 1, increments on
every password change). Each key stores `encryptedWithGeneration` — the
generation of the password used to encrypt it. The current encryption key
(cached in localStorage) can only decrypt keys matching the current
generation.

**How it works in the UI:**

- Keys page shows all keys with their generation.
- Keys matching the current generation show as decryptable.
- Keys under an older generation show as "locked" with an option to
  re-encrypt: enter the old password, the system derives the old encryption
  key, decrypts the private key, re-encrypts with the current encryption
  key, updates the key's generation.
- Messages encrypted with a locked key show "Cannot decrypt — update
  password on Keys page" instead of the current generic error.

#### Changes

**`webapp/src/db/schema.ts`** — Add generation tracking:

- `users` table: add `passwordGeneration` column (int, default 1).
- `user_keys` table: add `encryptedWithGeneration` column (int, default 1).

**`webapp/src/server/user.server.ts`:**

- `saveUser` — set `passwordGeneration = 1` when creating the account.
  Set `encryptedWithGeneration = 1` on the initial key.
- `changePassword` — increment `passwordGeneration`. New keys get the new
  generation. Do NOT re-encrypt old keys (they stay under the old
  generation).
- `rotateKey` — new key gets `encryptedWithGeneration = currentGeneration`.
- Add `reEncryptKey(keyId, encryptedPrivateKey, generation)` — updates a
  single key's encrypted data and generation.

**`webapp/src/server/user.functions.ts`:**

- `getMyKeys` — return `encryptedWithGeneration` and user's current
  `passwordGeneration` so the UI can tell which keys are decryptable.
- `changeMyPassword` — increment generation, only re-encrypt keys that
  match the current generation (not all keys).
- Add `reEncryptMyKey(keyId, encryptedPrivateKey)` — re-encrypts a single
  key under the current password generation.

**`webapp/src/routes/_app/_saved/_chrome/keys.tsx`** — Update keys page:

- Show each key's generation and whether it matches the current password.
- For locked keys: "Re-encrypt" button that opens a form to enter the old
  password. Client-side: derives old encryption key, decrypts the private
  key, re-encrypts with current encryption key, calls `reEncryptMyKey`.
- After re-encryption, the key shows as decryptable.

**`webapp/src/routes/_app/_saved/channel.$address.tsx`** — Update message
decryption:

- When decryption fails due to a wrong key, check if the key's generation
  differs from current. If so, show "Cannot decrypt — update password on
  Keys page" with a link.

**`webapp/src/lib/auth.ts`:**

- `decryptPrivateKey` already throws on failure. No changes needed — the
  caller determines the error message based on generation mismatch.

#### Verification

1. Create account, set password. Key 1 is generation 1. All messages
   decryptable.
2. Rotate key. Key 2 is generation 1 (same password). Both keys
   decryptable.
3. Change password. `passwordGeneration` increments to 2.
4. Rotate key. Key 3 is generation 2. Keys page shows keys 1-2 as locked
   (generation 1), key 3 as active (generation 2).
5. Send a message — uses key 3, decrypts fine.
6. Old messages encrypted with keys 1-2 show "Cannot decrypt — update
   password on Keys page".
7. On keys page, click "Re-encrypt" on key 2. Enter old password. Key 2
   updates to generation 2. Messages using key 2 now decrypt.
8. Key 1 remains locked until re-encrypted the same way.
