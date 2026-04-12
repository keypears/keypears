+++
status = "open"
opened = "2026-04-11"
+++

# Email-compatible address names

## Goal

Make KeyPears addresses compatible with email address syntax. The local part
(before the `@`) should accept any valid email local part, not just the current
`[a-z][a-z0-9]{0,29}` restriction. Each server decides its own naming policy
for local users; remote addresses are accepted as long as they conform to the
email spec.

## Background

KeyPears addresses look like email: `alice@keypears.com`. But the current
`nameSchema` restricts the local part to 1-30 lowercase alphanumeric characters
starting with a letter. This is stricter than email (RFC 5321), which allows:

- Uppercase letters (case-insensitive by convention)
- Dots: `alice.bob@example.com`
- Hyphens, underscores: `alice-bob@example.com`, `alice_bob@example.com`
- Plus addressing: `alice+tag@example.com`
- Numbers at any position: `123@example.com`
- Up to 64 characters in the local part

Other KeyPears servers may want to allow any of these. If a user on
`example.com` has the name `alice.bob`, our server needs to accept that address
when sending messages to them, looking up their public key, or receiving
federated messages from them.

### Current constraints

`nameSchema` in `server/schemas.ts` is used in three contexts:

1. **Local account creation** (`saveMyUser`, `createDomainUserFn`) — enforces
   naming policy for users on this server.
2. **Name availability check** (`checkNameAvailable`) — validates before save.
3. **Address parsing** (`parseAddress` in `lib/config.ts`) — splits `name@domain`
   for both local and remote addresses.

The fix: separate "local naming policy" from "valid address format." The local
policy (`nameSchema`) stays strict for keypears.com users. A new, broader
validation is used everywhere that handles remote addresses.

### What needs to change

- `parseAddress()` currently accepts any `name@domain` format — this is already
  fine for remote addresses.
- All places that validate the name part of a *remote* address should use a
  permissive email-compatible validator, not `nameSchema`.
- `nameSchema` stays as-is for local account creation on keypears.com.
- Domain admins who claim domains on this server could optionally have their own
  naming policy, but for now `nameSchema` applies to all local domains.

### Files likely affected

- `server/schemas.ts` — add an `emailLocalPartSchema` for remote address names
- `server/user.functions.ts` — ensure `nameSchema` is only applied to local
  account creation, not remote address lookups
- `lib/config.ts` — `parseAddress()` may need validation of the local part
- `routes/_app/welcome.tsx` — client-side validation uses `nameSchema`
- `routes/_app/_saved/_chrome/domains.tsx` — domain user creation
- `server/api.router.ts` — federation endpoints accept remote addresses
- `server/message.functions.ts` — message sending to remote addresses
