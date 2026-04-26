+++
status = "open"
opened = "2026-04-26"
+++

# API cleanup and federation simplification

## Goal

Reduce protocol complexity, eliminate miswiring risks, and make the federation
contract easier for independent implementers to understand and build against.

## Background

A code audit identified several pressure points in the API surface and internal
architecture. None are correctness bugs today, but they increase implementation
burden, create fragile assembly patterns, and make the protocol harder to
implement independently — directly contradicting the design goal of federation
simplicity.

## Findings

### 1. Duplicated message assembly (medium)

`encryptMessage` in `webapp/src/lib/message.ts` takes 14 positional arguments.
Near-identical send flows appear in three routes:

- `webapp/src/routes/_app/_saved/_chrome/send.tsx`
- `webapp/src/routes/_app/_saved/channel.$address.tsx`
- `webapp/src/routes/_app/_saved/vault.$id.tsx`

Each route manually assembles the same argument list. One misordered argument
silently produces a cryptographically broken message.

**Fix:** Extract a `prepareOutboundMessage({ plaintext, recipientAddress, ... })`
helper with named parameters. Routes call one function instead of threading 14
args.

### 2. Loose wire schemas (medium)

Most key, ciphertext, signature, address, token, and PoW fields in the oRPC
contract (`packages/client/src/contract.ts`) and server functions are plain
`z.string()`. The code relies on downstream `FixedBuf.fromHex` /
`WebBuf.fromHex` failures to catch malformed input.

**Fix:** Define reusable schemas like `hexBytes(32)`, `hexBytes(3374)`,
`hexMaxBytes(50000)`, and `addressSchema`. Makes the API self-documenting and
catches malformed input at the validation boundary.

### 3. Active-key-only delivery race (medium)

`getPublicKey` returns only the current active key set. The recipient server
rejects messages unless the recipient's keys match the current active key
(`message.functions.ts`, `api.router.ts`). If the recipient rotates keys after
the sender looks them up but before delivery completes, the message is
cryptographically valid but rejected.

**Fix:** Include `keyNumber` on the wire format. The recipient matches against
any retained key set by exact public-key match + key number, not just the
current active key.

### 4. Redundant notifyMessage fields (medium)

The notification payload includes `senderEd25519PubKey`, `senderEncryptedContent`,
and `senderSignature`, but the recipient immediately pulls the real message and
verifies that instead. These fields are dead weight on the wire.

**Fix:** Strip `notifyMessage` down to pull token + sender address + recipient
address (enough to route). Add a commitment hash later if pre-pull binding is
needed.

### 5. Overloaded key names (low)

`senderPubKey` means ML-DSA-65 verification key. `recipientPubKey` means
ML-KEM-768 encapsulation key. This is confusing for implementers reading the
contract.

**Fix:** Use explicit names (`senderMldsaPubKey`, `recipientMlkemPubKey`) or
nested key objects (`senderKeys.mldsa65`, `recipientKeys.mlkem768`). This is a
breaking change — do it if versioning the contract.

### 6. `as string` casts in route components (low)

Protocol-critical data in `send.tsx`, `channel.$address.tsx`, and
`vault.$id.tsx` is cast with `as string` due to untyped server function
returns. Symptom of missing return type annotations on server functions.

**Fix:** Add typed return shapes to server functions so route components don't
need casts.

## Priority order

1. `prepareOutboundMessage` helper (eliminates duplication + miswiring risk)
2. Typed hex schemas in contract (self-documenting, easy win)
3. `keyNumber` on the wire (fixes rotation race)
4. Strip `notifyMessage` (simplifies federation surface)
5. Key naming (cosmetic, do with contract version bump)
6. Remove `as string` casts (cosmetic, fix upstream types)
