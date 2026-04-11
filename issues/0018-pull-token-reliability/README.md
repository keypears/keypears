+++
status = "open"
opened = "2026-04-11"
+++

# Pull token message loss on recipient failure

## Goal

Ensure cross-domain messages are never lost due to transient failures during the
pull-model delivery flow.

## Background

Cross-domain message delivery uses a pull model: the sender's server stores the
ciphertext in `pending_deliveries` with a hashed one-time token, then notifies
the recipient's server. The recipient's server calls `pullMessage` with the
token to retrieve the ciphertext, then stores it locally.

The problem is in `api.router.ts`: `pullMessage` atomically selects and deletes
the pending delivery (`SELECT ... FOR UPDATE` + `DELETE` in a transaction)
before returning the ciphertext in the HTTP response. Back in the
`notifyMessage` handler, the recipient validates and stores the message via
`insertMessage`.

If the recipient's server crashes, loses the network connection, or encounters
any error **after** `pullMessage` returns but **before** `insertMessage`
completes, the message is permanently lost:

- The pending delivery was already deleted by the sender's server.
- The recipient never stored it.
- There is no retry mechanism — the token is consumed.
- The sender's copy is fine (stored before notification), so the sender sees the
  message but the recipient never receives it.

### Relevant code

- `webapp/src/server/api.router.ts:220-254` — `pullMessage` handler (deletes
  before returning)
- `webapp/src/server/api.router.ts:143-218` — `notifyMessage` handler (pulls
  then stores, no atomicity between the two)
- `webapp/src/server/federation.server.ts:155-189` — `deliverRemoteMessage`
  (creates pending delivery and notifies)

### Possible approaches

1. **Don't delete on pull.** Mark the delivery as "pulled" instead of deleting
   it. The recipient confirms receipt with a second call, which then deletes
   it. Adds a round-trip but guarantees at-least-once delivery.

2. **Retry with the same token.** Allow the token to be used multiple times
   within its 24-hour expiry window. Delete only when the recipient confirms
   or when the delivery expires. Risk: a malicious intermediary could replay
   the pull, but the content is E2E encrypted so this only leaks ciphertext
   (which the intermediary already saw in transit).

3. **Idempotent pull with TTL.** Keep the pending delivery for a short window
   (e.g., 5 minutes) after the first pull. Subsequent pulls with the same
   token return the same data. After the window, delete. Simple and handles
   transient failures without a confirmation round-trip.
