+++
status = "open"
opened = "2026-04-09"
+++

# Issue 11: Configurable Proof of Work

## Goal

Allow users to configure how much proof of work they require from senders.
Currently, PoW difficulty is hardcoded globally. Recipients should control the
cost of reaching them — both for opening a new channel and for each individual
message.

## Background

Currently, all message PoW uses `LOGIN_DIFFICULTY` (7M) globally. The
`getPowChallenge` endpoint in `api.router.ts` returns a challenge at this fixed
difficulty. There's no way for a user to say "I want more protection" or "I want
less friction."

### How it should work

**Per-user defaults.** Each user has two configurable difficulty values:

- `channelDifficulty` — required to open a new channel (first message to this
  user). Higher = harder to spam new conversations.
- `messageDifficulty` — required for each subsequent message. Lower than channel
  difficulty for existing conversations.

These are stored on the user record (or a settings table) and exposed via the
`getPowChallenge` endpoint. When a sender requests a PoW challenge for a
recipient, the challenge difficulty is set by the recipient's preferences.

**Per-channel overrides (future).** A user could override the difficulty for a
specific channel — e.g. lower it for trusted contacts, raise it for strangers.
This is a natural extension but not needed immediately.

### What needs to change

**Database:**

- Add `channelDifficulty` and `messageDifficulty` columns to the `users` table
  (bigint, nullable — null means use server default).

**API:**

- `getPowChallenge` endpoint needs to accept the recipient's address so it can
  look up their difficulty preference. Currently it takes no input and returns a
  challenge at the global default.
- The client already calls `getRemotePowChallenge(recipientAddress)` which
  proxies to the recipient's server. The recipient's server just needs to use
  that user's difficulty instead of the global constant.

**Server functions:**

- Add a settings page or section where users can configure their PoW
  requirements.
- Validate that difficulty values are within reasonable bounds (not zero, not
  absurdly high).

**UI:**

- Settings section (could be on the Keys page or a new Settings page) where
  users set their channel and message difficulty.
- Show the current difficulty to the sender during PoW mining (the PowModal
  already shows this).

### What stays the same

- The PoW algorithm (pow5-64b).
- The mining flow (client mines on WebGPU, server verifies).
- The challenge signing mechanism (BLAKE3 MAC).
- Registration and login PoW (these stay at fixed global difficulty).

## Experiments

### Experiment 1: Per-user configurable PoW difficulty

#### Description

Add per-user `channelDifficulty` and `messageDifficulty` settings. The
`getPowChallenge` endpoint accepts a recipient address and returns a challenge
at the recipient's configured difficulty. A settings UI with sliders lets users
control their difficulty preferences.

**Server-enforced minimums:**

- `MIN_CHANNEL_DIFFICULTY = 7_000_000n` (7M, ~1s)
- `MIN_MESSAGE_DIFFICULTY = 7_000_000n` (7M, ~1s)

**Defaults:**

- Channel: `CHANNEL_DIFFICULTY = 70_000_000n` (70M, ~15s)
- Message: `MESSAGE_DIFFICULTY = 7_000_000n` (7M, ~1s)

Users can raise above the defaults or lower down to the minimums, but never
below.

**Slider presets (logarithmic scale):**

- Low: 7M (~1 second)
- Medium: 70M (~15 seconds)
- High: 700M (~2 minutes)

The API stores and transmits the raw bigint. The slider is purely a UI
convenience.

#### Changes

**`webapp/src/db/schema.ts`:**

- Add to `users` table:
  - `channelDifficulty` bigint, nullable (null = use server default)
  - `messageDifficulty` bigint, nullable (null = use server default)

**`webapp/src/server/pow.server.ts`:**

- Add `MIN_CHANNEL_DIFFICULTY = 7_000_000n`
- Add `MIN_MESSAGE_DIFFICULTY = 7_000_000n`

**`webapp/src/server/user.server.ts`:**

- Add `updatePowSettings(userId, channelDifficulty, messageDifficulty)` —
  validates both values are above minimums, stores in users table.
- Add `getUserPowSettings(userId)` — returns the user's difficulty preferences
  (or defaults if null).

**`webapp/src/server/user.functions.ts`:**

- Add `updateMyPowSettings({ channelDifficulty, messageDifficulty })` — server
  function for the settings UI.
- Add `getMyPowSettings()` — returns current user's settings for the UI.

**`webapp/src/server/api.router.ts`:**

- `getPowChallenge` — change from no-input to accepting
  `{ recipientAddress: string }`. Parse the address, look up the recipient's
  domain and user, read their `messageDifficulty` (or default). Create challenge
  at that difficulty.
- Need to determine whether this is a new channel or existing message. For now,
  use `messageDifficulty` for all (channel difficulty differentiation is a
  future enhancement when the sender's server can indicate "new channel" vs
  "existing").

**`webapp/src/server/federation.server.ts`:**

- `fetchRemotePowChallenge` — pass the recipient address through to the remote
  server's `getPowChallenge` endpoint.

**`webapp/src/server/message.functions.ts`:**

- `getRemotePowChallenge` — already passes recipient address. May need to update
  to match new `getPowChallenge` input format.

**`webapp/src/routes/_app/_saved/_chrome/settings.tsx`** — New page (or section
on existing page):

- Two sliders: "New conversations" and "Messages"
- Each slider: Low / Medium / High with human-readable time estimates
- Shows current values on load
- Save button calls `updateMyPowSettings`
- Server validates minimums — slider min position maps to server min

**`webapp/src/components/Sidebar.tsx`:**

- Add "Settings" link in user dropdown (if new page) or this could be a section
  on the Keys page.

#### Verification

1. Create account. Default settings: channel 70M, message 7M.
2. Open Settings. Sliders show at correct positions.
3. Lower message difficulty to Low (7M) — already at minimum, works.
4. Raise message difficulty to High (700M) — saves successfully.
5. Send a message to this user from another account — PoW modal shows 700M
   difficulty, takes ~2 minutes.
6. Lower message difficulty back to Low (7M) — PoW is fast again.
7. Try to set difficulty below 7M via API — server rejects.
8. User with no custom settings uses server defaults.
9. Cross-domain: sender on keypears.test sends to user on passapples.test who
   has custom difficulty — challenge reflects the recipient's setting.

**Result:** Fail

#### Conclusion

The settings UI, database columns, server functions, and per-user
`messageDifficulty` lookup all work correctly. However, the experiment neglected
to implement channel difficulty: the `getPowChallenge` endpoint always returns
`messageDifficulty` regardless of whether the sender is opening a new channel or
messaging in an existing one. To use `channelDifficulty`, the endpoint needs the
sender's address so it can check whether a channel already exists between the
two users. The next experiment must add this sender identification to the
challenge request.

### Experiment 2: Authenticated challenge requests

#### Description

The sender must prove their identity to receive a PoW challenge. Without
this, anyone can probe whether two users have a channel by requesting
challenges with different sender addresses and observing the difficulty —
a privacy violation that leaks social graph information.

**How it works:**

1. Sender's client signs a challenge request with their secp256k1
   private key: `sign({ senderAddress, recipientAddress, timestamp })`.
2. Sender's server proxies this signed request to the recipient's
   server via `getPowChallenge`.
3. Recipient's server:
   a. Fetches the sender's public key via federation (`getPublicKey`
      on the sender's domain — verified by TLS).
   b. Verifies the signature matches the claimed sender address.
   c. Checks if a channel exists between sender and recipient.
   d. Returns a challenge at the appropriate difficulty (channel or
      message), with both addresses signed into the challenge payload.
4. When the message arrives, the server verifies the PoW challenge
   signature includes the correct sender and recipient addresses.

**Privacy guarantee:** You cannot learn whether two users have a channel
unless you can produce a valid signature for one of them.

#### Changes

**`webapp/src/server/pow.server.ts`:**

- `signChallenge` — include `senderAddress` and `recipientAddress` in
  the signed payload.
- `createPowChallenge` — accept sender/recipient addresses, pass to
  `signChallenge`, include in returned challenge.
- `verifyPowSolution` — accept sender/recipient addresses, verify
  they match the challenge signature.

**`webapp/src/server/api.router.ts`:**

- `getPowChallenge` — accept `{ senderAddress, recipientAddress,
  senderPubKey, signature, timestamp }`. Fetch sender's public key
  from sender's domain via federation. Verify signature. Check channel
  existence. Return challenge at appropriate difficulty.

**`webapp/src/server/schemas.ts`:**

- Add `senderAddress` and `recipientAddress` to `PowSolutionSchema`.

**`webapp/src/server/pow.consume.ts`:**

- `verifyAndConsumePow` — accept and pass through addresses.

**`webapp/src/server/message.functions.ts`:**

- `sendMessage` local path — pass addresses to PoW verification.
- `getRemotePowChallenge` — accept sender address, public key. Client
  signs the request before sending.

**`webapp/src/server/federation.server.ts`:**

- `fetchRemotePowChallenge` — pass signed request to remote
  `getPowChallenge`.

**Client changes:**

- Send page and channel page sign the challenge request with the
  user's private key before requesting PoW.
- The `PowChallenge` and `PowSolution` types carry `senderAddress`
  and `recipientAddress`.

**`webapp/src/lib/use-pow-miner.ts`:**

- Types updated for address fields.

#### Verification

1. Alice sets channel difficulty to High (700M), message to Low (7M).
2. Bob (new sender, authenticated) sends to Alice — PoW shows 700M.
   Channel opens.
3. Bob sends again — PoW shows 7M (channel exists).
4. Carol (new sender, authenticated) sends to Alice — PoW shows 700M.
5. Attacker tries to request challenge as Bob (without Bob's private
   key) — signature verification fails, challenge denied.
6. Attacker tries unsigned request — rejected.
7. Cross-domain: sender authenticated via federation public key lookup.
8. Login and registration PoW unchanged (no sender identity needed).

**Result:** Pass

#### Conclusion

PoW challenge requests are now authenticated. The sender signs the request
with their secp256k1 private key, and the recipient's server verifies the
signature via federation public key lookup before returning a challenge.
Channel existence determines difficulty: new channels use
`channelDifficulty` (default 70M), existing channels use
`messageDifficulty` (default 7M). Both addresses are signed into the
challenge payload, preventing reuse across different sender/recipient
pairs. Privacy is preserved — you cannot probe channel existence without
holding a valid private key.
