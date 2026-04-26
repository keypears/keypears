+++
status = "open"
opened = "2026-04-25"
+++

# Channel message management

## Goal

Add per-message and bulk message deletion in channel conversations. Each
message gets a three-dot menu with "Delete" and "Delete earlier" options.
All deletions are local-only — they remove messages from the current user's
channel, not the counterparty's.

## Behavior

**Delete (single message):**
- Removes one message from the user's channel
- No confirmation dialog — the action is obvious
- Local-only — does not affect the counterparty's copy

**Delete earlier (bulk):**
- Deletes all messages in the channel created before the selected message
  (both sent and received)
- Requires confirmation ("Delete all messages before this one? This cannot
  be undone.")
- Local-only — does not affect the counterparty's copies

## UI

Each message bubble in `channel.$address.tsx` gets a vertical three-dot menu
(EllipsisVertical icon from lucide-react). The menu appears on hover or tap.
Two options:

1. **Delete** — deletes this message
2. **Delete earlier** — deletes all messages before this one (with confirmation)

## Implementation

**Server functions** (`message.functions.ts` or `message.server.ts`):
- `deleteMessage({ messageId })` — delete a single message row, scoped to
  the authenticated user's channels
- `deleteEarlierMessages({ channelId, beforeId })` — delete all messages
  in the channel with `id < beforeId`, scoped to the user's channels

**Security**: both functions must verify the message/channel belongs to the
authenticated user. Use `authMiddleware`.

**UI**: after deletion, remove the message(s) from the local `messageList`
state. No need to refetch — just filter the state.

## Plan

1. Add server functions for single and bulk delete.
2. Add the three-dot menu to each message in the channel page.
