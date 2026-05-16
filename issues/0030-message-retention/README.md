+++
status = "closed"
opened = "2026-04-25"
closed = "2026-05-16"
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

## Experiment 1: Message deletion

### Goal

Add "Delete" and "Delete earlier" functionality to channel messages. Server
functions for both operations, three-dot dropdown menu on each message bubble.

### Server functions (`message.server.ts`)

```typescript
export async function deleteMessageById(
  messageId: string,
  userId: string,
): Promise<boolean>
```

Delete a single message where `messages.id = messageId` AND the message's
channel belongs to the user (`channels.ownerId = userId`). Join messages →
channels to verify ownership. Return true if deleted, false if not found.

```typescript
export async function deleteEarlierMessages(
  messageId: string,
  userId: string,
): Promise<number>
```

Find the message's `channelId` and verify the channel belongs to the user.
Then delete all messages in that channel where `messages.id < messageId`.
UUIDv7 IDs are time-ordered, so `<` comparison gives chronological ordering.
Return the count of deleted rows.

### Server function wrappers (`message.functions.ts`)

```typescript
export const deleteChannelMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ messageId: z.string() }))
  .handler(...)

export const deleteEarlierChannelMessages = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ messageId: z.string() }))
  .handler(...)
```

Both use `authMiddleware` to get `userId` from session. Both take only
`messageId` — the server derives `channelId` from the message row.

### UI (`channel.$address.tsx`)

Add a `DropdownMenu` (shadcn, already used in vault.$id.tsx) to each message
bubble. The menu trigger is an `EllipsisVertical` icon (already imported).

Position: on the outer edge of the message bubble — right side for sent
messages, left side for received messages. Small, subtle, appears on
hover/focus.

Menu items:
1. "Delete" — calls `deleteChannelMessage`, removes from `messageList` state
2. "Delete earlier" — shows a confirm dialog, then calls
   `deleteEarlierChannelMessages`, filters `messageList` state

For "Delete earlier" confirmation, use a simple `window.confirm()` — no need
for a custom modal for this.

After deletion, update `messageList` state locally:
- Single delete: `setMessageList(prev => prev.filter(m => m.id !== msgId))`
- Delete earlier: `setMessageList(prev => prev.filter(m => m.id >= msgId))`

### Files to modify

1. `webapp/src/server/message.server.ts` — add `deleteMessageById`,
   `deleteEarlierMessages`
2. `webapp/src/server/message.functions.ts` — add server function wrappers
3. `webapp/src/routes/_app/_saved/channel.$address.tsx` — add dropdown menu
   to each message bubble

### Result

Closed without implementation.

The planned local-only message deletion controls were not implemented. This
issue is closed so it no longer remains in the active issue queue.

## Conclusion

Issue 30 proposed per-message deletion and "delete earlier" bulk deletion for
channel conversations, scoped locally to the current user's channel. The work
was not implemented, and no server functions or UI changes were added under
this issue. The issue is closed without changes to the product.
