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
