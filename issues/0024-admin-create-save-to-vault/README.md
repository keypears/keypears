+++
status = "open"
opened = "2026-04-12"
+++

# Admin user creation → save credentials to vault in one step

## Goal

On the domains page "add user" form, let the admin generate a strong password
with one button and (optionally) save the resulting credentials to their own
vault in the same action. The admin should be able to create
`admin@keypears.com`, `postmaster@keypears.com`, and a handful of other role
accounts in a few minutes, without leaving the form, without inventing
passwords, and without copy-pasting credentials into the vault UI afterward.

## Background

KeyPears is its own password manager — the vault stores login credentials
encrypted client-side under a key derived from the user's P-256 private key.
KeyPears also has an admin flow for creating users on a claimed domain: at
`/domains`, the verified admin of a domain can click "add user," type a name and
password, and `createDomainUserFn` creates the account without any public signup
friction (no PoW gate, no incognito session, no logout).

The two flows are adjacent but separate. If the admin wants to create a set of
role accounts on their domain (e.g. `admin`, `support`, `postmaster`,
`security`, `press` on `keypears.com`) and keep the credentials in their own
password manager, the current path is:

1. Admin opens the add-user form, types the name and a password they have to
   invent on the spot.
2. Clicks create. User is created.
3. Admin navigates away to `/vault`.
4. Creates a new entry by hand.
5. Copy-pastes the address and password from memory or from a scratch buffer.
6. Saves the entry.
7. Repeats for each role account.

Every step 3-6 is friction that exists only because the two flows don't know
about each other. The password exists on the client already (the admin typed
it); the admin's vault key is already in scope (`getCachedEncryptionKey()` gives
access to it); the server function for creating vault entries already exists
(`createEntry`); the zod schemas for vault entry data already exist. There's no
missing infrastructure — just no UI that composes the two.

This issue is about building that composition.

## Problem statement

The admin should be able to:

1. **Generate a strong password in one click.** Admins shouldn't have to invent
   passwords for role accounts they don't plan to memorize. Generating a
   cryptographically-random 20-character password with `crypto.getRandomValues`
   removes the cognitive load and is strictly stronger than anything a human
   would type.

2. **Opt in (per creation) to saving the new credentials into their own vault.**
   A checkbox on the form controls this. Default off for safety — the admin form
   is also used to create accounts for other people, not just role accounts the
   admin owns, and saving someone else's password in your own vault is a trust
   concern. Default-off means the feature is available when you need it and
   invisible when you don't.

3. **See the generated password at least once, always.** Even when the vault
   save succeeds, show the password briefly in a copy-friendly form so the admin
   can verify it was saved and, if they want, keep a backup somewhere else.
   Today's form hides passwords completely, which creates anxiety when you're
   trusting a value you never saw.

4. **Recover gracefully if the vault save fails.** If `createDomainUserFn`
   succeeds but `createEntry` fails (network blip, server error, etc.), the
   admin has a created user with credentials that are about to evaporate from
   memory. The form must show the generated password in a copy-friendly modal
   with a clear warning that the vault save failed and this is the user's last
   chance to capture the credential.

## Constraints

- **No new server functions.** Both `createDomainUserFn` and `createEntry`
  already exist and are authored for exactly this purpose. This is a pure
  client-side composition.
- **No new schema.** Vault entries already have a `type: "login"` variant with
  `username`, `password`, `notes`, etc. We're using the existing shape.
- **Keep the admin's existing encryption-key cache as the only cryptographic
  state.** `getCachedEncryptionKey()` → decrypt the admin's private key →
  `deriveVaultKey()` → encrypt the vault entry. All of this already happens in
  the normal vault flow; we're just calling it from a different button.
- **Failure isolation.** If vault save fails, the user-creation must not roll
  back (the user was created successfully on the server and the admin can reset
  the password later through the existing reset flow). The failure handling is
  purely about telling the admin what happened and giving them one last chance
  to copy the password.

## Proposed solution

### UI changes to the admin "add user" form on `/domains`

The existing form has: address input, password input, confirm password input,
create button. Add:

- **Generate button** next to the password field. On click, generates a
  cryptographically-random 20-character password and fills both `password` and
  `confirm` with it. Toggles the inputs to show plain text so the admin can see
  the value. Clicking Generate again rolls a new one.

- **"Save to my vault" checkbox** below the confirm field. Default unchecked.
  When checked, successful user creation triggers a vault entry creation flow.

- **Post-create confirmation modal** (shown in all success cases when Generate
  was used, not just when save-to-vault was checked). Shows the address and the
  generated password in a copy-friendly textarea, plus a message like "User
  created" or "User created and saved to your vault." For the failure case, the
  modal becomes a warning: "User created but vault save failed. Copy this
  password now — it cannot be recovered."

### Client-side composition in `handleAddUser`

Extend the existing handler to:

1. Derive keys and create the user via `createDomainUserFn` (unchanged).
2. If "Save to vault" is checked: a. Get the admin's cached encryption key. b.
   Decrypt the admin's active private key via `decryptPrivateKey`. c. Build a
   `VaultEntryData` object of type `login` with `username = <full new address>`
   and `password = <generated password>`. d. Encrypt it via
   `encryptVaultEntry(data, adminPrivateKey)`. e. Call the existing
   `createEntry` server function with name = `"KeyPears: <full new address>"`,
   type = `"login"`, searchTerms = `"keypears <local_part> <full_address>"`,
   etc.
3. Show the confirmation modal (or failure modal) with the result.

### Password generation helper

Add a small helper to `webapp/src/lib/auth.ts`:

```ts
/** Generate a cryptographically-random password suitable for a new
 *  user account. Uses 20 characters drawn from a broad alphabet of
 *  unambiguous printable ASCII. */
export function generatePassword(length = 20): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789" +
    "!@#$%^&*-_+=?";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
```

(Final alphabet is TBD — might want to exclude symbols that confuse shell
escaping or copy-paste in terminals. The initial cut is a reasonable default;
the experiment will tune it.)

## Out of scope

- **Bulk create** (paste a list of names, create them all in one go). This is a
  tempting generalization but covers maybe 60 seconds of savings versus running
  the one-at-a-time flow six times. Revisit only if the admin ends up needing to
  create many accounts routinely, which there's no evidence of yet.

- **Anything that changes the public signup flow.** Public signup still requires
  PoW-gated anonymous registration and doesn't interact with any admin's vault.
  The improvement here only applies to the admin-create path on a claimed
  domain.

- **A general-purpose "password generator" anywhere else in the vault UI.** Out
  of scope for this issue, though the `generatePassword` helper can be reused
  later for a vault-UI "generate" button when creating a new login entry.

- **Automatic backup of the admin's vault itself.** If the vault is lost
  (encryption key lost, password forgotten), the admin loses access to every
  role account's credential. That's a separate concern — the same concern that
  applies to any password manager. Out of scope here.

## Open questions (to answer during Experiment 1)

1. **Default state of the "Save to vault" checkbox** — off (my lean) or on? Off
   favors safety; on favors the common case of the admin creating their own role
   accounts.

2. **Password length and alphabet.** 20 chars mixed-class is the default. Should
   certain symbols be excluded to avoid shell/escape problems on copy-paste?
   `` ` ``, `\`, `"`, `'`, `$`, space are the usual suspects.

3. **"Generated password was shown" flag.** Should the confirmation modal show
   the password in every case (even when the admin typed it manually), or only
   when it was auto-generated? Typed-manually passwords were already visible to
   the admin at creation time, so the modal is less necessary there.

4. **Vault entry `notes` content.** Should we embed creation metadata ("Created
   via admin form on 2026-04-12") or leave notes blank? I lean for a minimal
   note that aids later auditing ("who/when did this get created") without being
   noisy.

## Success criteria

Creating `admin@keypears.com` + `postmaster@keypears.com` +
`support@keypears.com`

- `security@keypears.com` + `press@keypears.com` should take **under two minutes
  total**, with no copy-paste between tabs, no password invention, and all five
  credentials saved to the admin's vault and retrievable from `/vault`
  immediately after.
