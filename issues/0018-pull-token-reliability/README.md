+++
status = "closed"
opened = "2026-04-11"
closed = "2026-04-11"
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
   it. The recipient confirms receipt with a second call, which then deletes it.
   Adds a round-trip but guarantees at-least-once delivery.

2. **Retry with the same token.** Allow the token to be used multiple times
   within its 24-hour expiry window. Delete only when the recipient confirms or
   when the delivery expires. Risk: a malicious intermediary could replay the
   pull, but the content is E2E encrypted so this only leaks ciphertext (which
   the intermediary already saw in transit).

3. **Idempotent pull with TTL.** Keep the pending delivery for a short window
   (e.g., 5 minutes) after the first pull. Subsequent pulls with the same token
   return the same data. After the window, delete. Simple and handles transient
   failures without a confirmation round-trip.

---

## Experiment 1: Stop deleting on pull, let expiry handle cleanup

### Hypothesis

The simplest fix is to stop deleting pending deliveries on pull. The delivery
already has a 24-hour expiry and lazy cleanup runs on every pull. If the
recipient crashes mid-delivery, it can retry with the same token and get the
same data. The delivery is only removed when it expires naturally.

This makes `pullMessage` idempotent: calling it multiple times with the same
token returns the same ciphertext. There is no security downside because the
ciphertext is E2E encrypted and was already transmitted over TLS — a replay only
yields data the caller already saw.

### Changes

**1. `webapp/src/server/api.router.ts` — `pullMessage` handler.**

Remove the `DELETE` from the transaction. Change from:

```
SELECT ... FOR UPDATE → DELETE → return data
```

To:

```
SELECT → return data
```

The `FOR UPDATE` lock and the `DELETE` are both removed. The existing lazy
cleanup (`DELETE WHERE expiresAt < NOW()`) already runs at the end of every
`pullMessage` call and handles expired deliveries.

**2. `webapp/src/server/api.router.ts` — `notifyMessage` handler.**

Add duplicate-message protection: before inserting, check if a message with the
same sender address, recipient public key, and encrypted content already exists
in the channel. If so, skip the insert. This makes the entire flow idempotent
end-to-end.

**3. `whitepaper/keypears.typ` — Update pull-model description.**

Remove "one-time" and "consumed on use" language. Describe the token as a pull
token with a time-limited expiry. Pending deliveries expire and are cleaned up
automatically.

**4. `docs/federation.md` — Update pull-model description.**

Same changes as the whitepaper.

### Pass criteria

- `pullMessage` no longer deletes the pending delivery.
- Calling `pullMessage` twice with the same token returns the same data.
- Duplicate messages are not created if `notifyMessage` is called twice.
- Tests and linter pass.
- Whitepaper and federation docs updated.

### Result: Pass

All changes implemented in commit `b8797596`. `pullMessage` now selects without
deleting. `notifyMessage` checks for duplicate messages via `messageExists()`
before inserting. Whitepaper and `docs/federation.md` updated to describe
idempotent pulls with time-limited expiry instead of one-time tokens. Linter:
0 errors, tests: 7/7 passed.

---

## Conclusion

The pull-model message delivery was vulnerable to message loss if the
recipient's server failed between pulling and storing. The fix was simple: stop
deleting pending deliveries on pull. The delivery persists until its 24-hour
expiry, and lazy cleanup removes expired entries. A `messageExists()` check
prevents duplicate messages if the same delivery is pulled and processed twice.
The whitepaper was updated to describe the pull as idempotent rather than
one-time, and to highlight the synchronous delivery model as an improvement
over email's silent retry queues.
