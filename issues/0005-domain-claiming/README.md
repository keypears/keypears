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
system to handle keys encrypted under different passwords. Currently, all keys
are encrypted with one password and password change re-encrypts everything
atomically. This breaks when:

- An admin creates a user with an initial password (and key).
- A password reset occurs (user forgot their password) — old keys can't be
  re-encrypted because nobody knows the old password.
- A user remembers their old password later and wants to recover access to old
  keys.

The fix: let users change the password on individual keys, track whether each
key's password matches the current login password, and decrypt selectively.

**How it works:**

Each key is encrypted with some password. The system doesn't track a generation
counter — it simply tries to decrypt each key with the current login password
(cached as the encryption key in localStorage). If decryption succeeds, the key
is usable. If not, it's "locked."

The user can change the password on any individual key to any password they
want. The UI indicates whether the key's password matches the current login
password:

- **Matches login password** — key is decryptable, data encrypted with this key
  auto-decrypts.
- **Different password** — key is locked, data encrypted with this key shows as
  undecryptable.

This enables several scenarios:

- **Password change** (user knows old password): re-encrypts only the keys that
  are currently decryptable (those matching the current login password). Keys
  under a different password are untouched.
- **Password reset** (simulated): user changes password on an old key to
  something different. Now that key is locked — its data can't be decrypted.
  This is what happens when an admin resets a password.
- **Recovery** (simulated): user enters the old password for a locked key,
  re-encrypts it with the current login password. The key unlocks and all its
  data becomes decryptable again.

#### Changes

**`webapp/src/server/user.server.ts`:**

- Add `reEncryptKey(userId, keyId, encryptedPrivateKey)` — updates a single
  key's encrypted private key. Verifies the key belongs to the user.

**`webapp/src/server/user.functions.ts`:**

- `changeMyPassword` — change to only re-encrypt keys that the client sends. The
  client determines which keys it can decrypt (those matching the current
  password) and sends their re-encrypted versions. Keys not included are left
  unchanged.
- Add `reEncryptMyKey(keyId, encryptedPrivateKey)` — server function for
  re-encrypting a single key. The client decrypts with the old password,
  re-encrypts with any new password, and sends the result.
- `getMyKeys` — also return `encryptedPrivateKey` so the client can attempt
  decryption to determine which keys are locked.

**`webapp/src/routes/_app/_saved/_chrome/keys.tsx`** — Update keys page:

- For each key, attempt decryption with the current encryption key
  (client-side). Show status: "Active" (decryptable) or "Locked" (different
  password).
- For any key (active or locked): "Change password" button. Opens a form with
  two fields: "Current password for this key" and "New password." Client derives
  old encryption key, decrypts, derives new encryption key, re-encrypts, calls
  `reEncryptMyKey`.
- Show a notice if the new password matches / doesn't match the login password:
  "This key will auto-decrypt" vs "This key will not auto-decrypt — use your
  login password to enable auto-decryption."

**`webapp/src/routes/_app/_saved/channel.$address.tsx`** — Update message
decryption:

- When decryption fails because the key has a different password, show "Cannot
  decrypt — update password on Keys page" with a link, instead of the current
  generic "Unable to decrypt" or "Encrypted with a different key."

**`webapp/src/routes/_app/_saved/_chrome/password.tsx`** — Update password
change:

- Only re-encrypt keys that are currently decryptable. Fetch all keys, attempt
  to decrypt each with the current encryption key. Re-encrypt only the ones that
  succeed. Send only those to the server.

#### Verification

1. Create account, set password. Key 1 is active. All messages decryptable.
2. Rotate key. Key 2 is active (same password). Both keys decryptable.
3. On keys page, change key 1's password to something different. Key 1 shows as
   "Locked." Key 2 still active.
4. Old messages encrypted with key 1 show "Cannot decrypt — update password on
   Keys page."
5. On keys page, change key 1's password back to the login password. Key 1 shows
   as "Active" again. Old messages decrypt.
6. Change login password (via password page). Key 2 is re-encrypted with new
   password (active). Key 1 was locked — stays locked, untouched.
7. Enter key 1's password on keys page, re-encrypt with the new login password.
   Key 1 becomes active. All messages decrypt.
