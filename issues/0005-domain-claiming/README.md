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

**`webapp/src/db/schema.ts`:**

- `user_keys` table: add `loginKeyHash` column (varchar, nullable). Stores
  the server-hashed login key for the password that encrypted this key.
  Nullable for backwards compatibility — existing keys get the value
  populated from the user's current `passwordHash` on migration (or lazily).

**`webapp/src/server/user.server.ts`:**

- `insertKey` — accept and store `loginKeyHash` on the key.
- `saveUser` — when creating the initial key, compute `loginKeyHash` from
  the login key using the existing `hashLoginKey` function and store it.
- Add `reEncryptKey(userId, keyId, encryptedPrivateKey, loginKeyHash)` —
  updates a single key's encrypted private key and loginKeyHash. Verifies
  the key belongs to the user.

**`webapp/src/server/user.functions.ts`:**

- `saveMyUser` — pass loginKeyHash when creating the initial key.
- `rotateKey` — look up the user's current `passwordHash` and set
  `loginKeyHash` on the new key to match (same password = same hash).
- `changeMyPassword` — only re-encrypt keys the client sends (those it
  could decrypt). Update `loginKeyHash` on re-encrypted keys to the new
  password's hash. Keys not included stay unchanged.
- Add `reEncryptMyKey(keyId, encryptedPrivateKey, loginKey)` — server
  function for re-encrypting a single key. Server hashes the provided
  login key and stores it as `loginKeyHash`. The encryption key never
  touches the server — only the login key (for identification) and the
  re-encrypted private key.
- `getMyKeys` — return `encryptedPrivateKey` and `loginKeyHash` so the
  client can determine which keys match the current password. The client
  compares each key's `loginKeyHash` against the user's `passwordHash`
  — if they match, the key is encrypted with the current login password.

**`webapp/src/routes/_app/_saved/_chrome/keys.tsx`** — Update keys page:

- For each key, compare `loginKeyHash` to the user's `passwordHash`.
  Show status: "Active" (matches) or "Locked" (different password).
- Also attempt actual decryption client-side as a secondary check.
- For any key: "Change password" button. Opens a form with two fields:
  "Current password for this key" and "New password." Client derives
  old encryption key (decrypts), derives new encryption key (re-encrypts),
  derives new login key (sent to server for identification). Calls
  `reEncryptMyKey`.
- Show notice if the new password matches / doesn't match the login
  password: "This key will auto-decrypt" vs "This key will not
  auto-decrypt — use your login password to enable auto-decryption."

**`webapp/src/routes/_app/_saved/channel.$address.tsx`** — Update message
decryption:

- When decryption fails because the key has a different password, show
  "Cannot decrypt — update password on Keys page" with a link, instead
  of the current generic "Unable to decrypt" or "Encrypted with a
  different key."

**`webapp/src/routes/_app/_saved/_chrome/password.tsx`** — Update password
change:

- Only re-encrypt keys that are currently decryptable. Fetch all keys,
  attempt to decrypt each with the current encryption key. Re-encrypt
  only the ones that succeed. Send only those to the server. Keys under
  a different password are left untouched.

#### Verification

1. Create account, set password. Key 1 is active (loginKeyHash matches
   passwordHash). All messages decryptable.
2. Rotate key. Key 2 is active (same loginKeyHash). Both keys decryptable.
3. On keys page, change key 1's password to something different. Key 1
   shows as "Locked" (loginKeyHash no longer matches). Key 2 still active.
4. Old messages encrypted with key 1 show "Cannot decrypt — update
   password on Keys page."
5. On keys page, change key 1's password back to the login password. Key 1
   shows as "Active" again. Old messages decrypt.
6. Change login password (via password page). Key 2 is re-encrypted with
   new password (active, loginKeyHash updated). Key 1 was locked — stays
   locked, untouched.
7. Enter key 1's password on keys page, re-encrypt with the new login
   password. Key 1 becomes active. All messages decrypt.
8. Verify the database: `user_keys.loginKeyHash` is always a server-side
   hash, never the raw login key. The encryption key never appears in any
   server request or database column.

**Result:** Pass

#### Conclusion

Per-key password management works. Each key tracks its `loginKeyHash` to
identify which password encrypted it. The keys page shows active vs locked
status and allows re-encrypting individual keys with any password. Password
change only re-encrypts keys that match the current password. Message
decryption uses a `Map<publicKey, keyData>` to find the correct key for each
message. Messages encrypted with locked keys show a clear error linking to
the keys page. Also fixed a pre-existing bug where messages sent with older
keys displayed on the wrong side (left instead of right) — now all of the
user's public keys are checked, not just the active one.

### Experiment 2: Domain claiming and admin user management

#### Description

Add the ability for a logged-in user to claim a domain and manage users
under it. The admin is verified against `keypears.json` on every privileged
action — no admin is stored in the database. The `keypears.json` file is the
live source of truth for who has admin rights.

**Claiming a domain:**

1. User enters a domain name on the Domains page.
2. Server fetches `https://{domain}/.well-known/keypears.json`.
3. Verifies `apiDomain` matches this server's `KEYPEARS_API_DOMAIN`.
4. Verifies `admin` matches the logged-in user's full address.
5. Domain is inserted into the `domains` table (no `adminUserId` stored —
   admin is always checked live from `keypears.json`).

**Creating a user under a domain:**

1. Admin enters a name and password on the Domains page.
2. Server re-fetches `keypears.json` and re-verifies admin.
3. Client-side: derives password key → login key + encryption key from the
   password the admin entered. Generates a key pair, encrypts private key
   with the encryption key.
4. Server: creates user with name + domainId, stores hashed login key as
   passwordHash, stores key with loginKeyHash.
5. The new user can now log in with `name@domain` and the password the
   admin chose.
6. The new user should change their password and rotate their key on first
   login (nudged by UI, not enforced yet).

**Resetting a user's password:**

1. Admin enters a new password for an existing user.
2. Server re-fetches `keypears.json` and re-verifies admin.
3. Client-side: derives new login key + encryption key. Generates a NEW
   key pair encrypted with the new password.
4. Server: updates user's passwordHash, inserts new key with new
   loginKeyHash. Old keys remain encrypted under their old passwords —
   the user can recover them later if they remember.
5. All existing sessions for the user are revoked.

#### Changes

**`webapp/src/server/user.server.ts`:**

- Add `verifyDomainAdmin(domain, adminAddress)` — fetches `keypears.json`
  from the domain, verifies `apiDomain` matches `getApiDomain()`, verifies
  `admin` matches `adminAddress`. Returns true/false.
- Add `createUserForDomain(name, domainId, loginKeyHex, publicKey,
  encryptedPrivateKey)` — creates a saved user under a specific domain.
  Similar to `saveUser` but creates a new user row directly (no unsaved
  user to upgrade).
- Add `resetUserPassword(userId, newLoginKeyHex, publicKey,
  encryptedPrivateKey)` — updates passwordHash, inserts new key, revokes
  all sessions.

**`webapp/src/server/user.functions.ts`:**

- Add `claimDomain(domain)` — requires session. Builds admin address from
  logged-in user. Calls `verifyDomainAdmin`. Inserts domain via
  `getOrCreateDomain`.
- Add `getMyDomains()` — returns all domains in the `domains` table where
  this server is the API domain (i.e. all locally hosted domains). The
  admin check happens when they try to do something, not when listing.
- Add `getDomainUsers(domainId)` — returns saved users for a domain.
  Requires admin verification.
- Add `createDomainUser({ domain, name, loginKey, publicKey,
  encryptedPrivateKey })` — requires admin verification. Creates user.
- Add `resetDomainUserPassword({ domain, userId, newLoginKey, publicKey,
  encryptedPrivateKey })` — requires admin verification. Resets password.

**`lockberries/src/pages/.well-known/keypears.json.ts`:**

- Add `admin` field: `ryan@keypears.test` (dev) / `ryan@keypears.com`
  (prod).

**`webapp/src/routes/_app/_saved/_chrome/domains.tsx`** — New page:

- **Claim a domain** section: input for domain name, "Claim" button.
  Instructions explaining the `keypears.json` requirements.
- **My domains** section: list of domains hosted by this server. Each
  domain expands to show:
  - User list (name, created date, active/locked key status).
  - "Add user" form: name + password fields. Client derives keys, sends
    to server.
  - Per-user "Reset password" button: new password field. Client derives
    new keys, sends to server.

**`webapp/src/components/Sidebar.tsx`:**

- Add "Domains" link in the user dropdown menu.

#### Verification

1. Log in as `ryan@keypears.test`.
2. Navigate to Domains page. Claim `lockberries.test` — succeeds (admin
   matches).
3. Create user `alice` under `lockberries.test` with a password.
4. Log out. Log in as `alice@lockberries.test` — succeeds.
5. Send a message from `alice@lockberries.test` to `ryan@keypears.test`.
   Message arrives and decrypts (both on same server, different domains).
6. Log back in as `ryan@keypears.test`. Go to Domains, reset Alice's
   password.
7. Log out. Log in as `alice@lockberries.test` with the NEW password —
   succeeds. Old messages show "Cannot decrypt" (old key under old
   password). New messages work.
8. Alice re-encrypts old key with old password on Keys page — old
   messages decrypt again.
9. Change `admin` field in lockberries `keypears.json` to a different
   user. Ryan can no longer perform admin actions on lockberries —
   server re-checks and rejects.
10. Claiming a domain with wrong `apiDomain` or wrong `admin` fails with
    clear error.
