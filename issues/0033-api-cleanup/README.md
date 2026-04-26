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

## Experiment 1 — All six fixes in one pass

All six findings are interconnected: renaming key fields changes the contract,
which changes the schemas, which changes the message assembly, which changes
the server functions, which changes the route components. Doing them together
avoids intermediate states where the contract and implementation disagree.

### Design

#### A. Rename key fields (finding 5)

Replace ambiguous names with explicit algorithm names across the entire wire
format: contract, server functions, DB queries (column aliases where needed),
route components, and federation handlers.

| Old name | New name | Meaning |
|---|---|---|
| `senderPubKey` | `senderMldsaPubKey` | ML-DSA-65 verification key |
| `recipientPubKey` | `recipientMlkemPubKey` | ML-KEM-768 encapsulation key |

These two are the only ambiguous names. The existing `senderEd25519PubKey`,
`senderX25519PubKey`, `recipientX25519PubKey` are already explicit and stay
as-is.

**Files:** `packages/client/src/contract.ts`, `webapp/src/db/schema.ts`
(column aliases or renames), `webapp/src/server/api.router.ts`,
`webapp/src/server/message.functions.ts`, `webapp/src/server/message.server.ts`,
`webapp/src/server/federation.server.ts`, `webapp/src/lib/message.ts`,
`webapp/src/routes/_app/_saved/_chrome/send.tsx`,
`webapp/src/routes/_app/_saved/channel.$address.tsx`,
`webapp/src/routes/_app/_saved/vault.$id.tsx`.

#### B. Typed hex schemas (finding 2)

Add reusable Zod schemas to `packages/client/src/contract.ts` (or a shared
schemas file in the client package):

```typescript
/** Hex-encoded byte string of exactly N bytes (2*N hex chars). */
const hexBytes = (n: number) =>
  z.string().regex(/^[0-9a-f]*$/i).length(n * 2);

/** Hex-encoded byte string of at most N bytes. */
const hexMaxBytes = (n: number) =>
  z.string().regex(/^[0-9a-f]*$/i).max(n * 2);

/** KeyPears address: name@domain */
const addressSchema = z.string().regex(/^[a-z][a-z0-9]*@[a-z0-9.-]+$/);
```

Apply to every field in the contract:

| Field | Schema |
|---|---|
| `ed25519PublicKey` | `hexBytes(32)` |
| `x25519PublicKey` | `hexBytes(32)` |
| `signingPublicKey` | `hexBytes(1952)` |
| `encapPublicKey` | `hexBytes(1184)` |
| `senderSignature` | `hexMaxBytes(3375)` |
| `encryptedContent` | `hexMaxBytes(50_000)` |
| `senderEncryptedContent` | `hexMaxBytes(50_000)` |
| `senderAddress`, `recipientAddress` | `addressSchema` |
| `pullToken`, `token` | `z.string().min(1)` |
| PoW `solvedHeader` | `hexBytes(32)` |
| PoW `target` | `hexBytes(32)` |

Also apply to `sendMessage` in `message.functions.ts` and `PowSolutionSchema`
in `schemas.ts`. The `saveMyUser` and other server functions in
`user.functions.ts` get the same treatment.

#### C. Strip notifyMessage (finding 4)

Remove `senderEd25519PubKey`, `senderEncryptedContent`, and `senderSignature`
from the `notifyMessage` contract input. The handler already ignores them —
it pulls the real message and verifies that.

The contract input becomes:

```typescript
notifyMessage.input(z.object({
  senderAddress: addressSchema,
  recipientAddress: addressSchema,
  pullToken: z.string().min(1),
  pow: PowSolutionSchema,
}))
```

Update `deliverRemoteMessage` in `federation.server.ts` to stop sending those
fields. The function signature drops the corresponding parameters.

#### D. Add keyNumber to the wire (finding 3)

**Contract changes:**

`getPublicKey` output adds `keyNumber: z.number().nullable()`.

`pullMessage` output and `sendMessage` input add
`recipientKeyNumber: z.number()`. This tells the recipient which key set was
used, so it can validate against any retained key — not just the active one.

**Server changes:**

`message.functions.ts` (`sendMessage`): Accept `recipientKeyNumber`. For local
delivery, look up the recipient's key by `keyNumber` instead of calling
`getActiveKey`. Validate that the provided public keys match that specific key
row. For remote delivery, pass it through to federation.

`api.router.ts` (`notifyMessage` handler): After pulling the message (which
now includes `recipientKeyNumber`), look up the recipient's key by
`keyNumber` instead of `getActiveKey`.

`api.router.ts` (`getPublicKey` handler): Return `keyNumber` from the active
key row.

`user.server.ts`: Add `getKeyByNumber(userId, keyNumber)` that looks up a
specific key row. Add `keyNumber` to the return from `getActiveKey`.

**Client changes:**

Routes store the `keyNumber` returned by `getPublicKey` (or from the user's
own key data) and include it in the `sendMessage` call.

#### E. prepareOutboundMessage helper (finding 1)

Add to `webapp/src/lib/message.ts`:

```typescript
interface OutboundMessageParams {
  text: string;                      // or secret: SecretPayload
  senderAddress: string;
  recipientAddress: string;
  senderEd25519Key: FixedBuf<32>;
  senderEd25519PubKey: WebBuf;
  senderSigningKey: FixedBuf<4032>;
  senderSigningPubKey: WebBuf;
  senderX25519Key: FixedBuf<32>;
  senderX25519PubKey: WebBuf;
  senderEncapKey: FixedBuf<1184>;
  recipientX25519PubKey: WebBuf;
  recipientEncapKey: FixedBuf<1184>;
  recipientEncapPubKey: WebBuf;
}

interface OutboundMessage {
  recipientAddress: string;
  encryptedContent: string;          // hex
  senderEncryptedContent: string;    // hex
  senderEd25519PubKey: string;       // hex
  senderX25519PubKey: string;        // hex
  senderMldsaPubKey: string;         // hex (renamed)
  recipientX25519PubKey: string;     // hex
  recipientMlkemPubKey: string;      // hex (renamed)
  senderSignature: string;           // hex
  recipientKeyNumber: number;        // new
}

export function prepareOutboundMessage(
  params: OutboundMessageParams & { recipientKeyNumber: number },
): OutboundMessage
```

This function calls `encryptMessage` internally and converts the result to the
hex wire format expected by `sendMessage`. The three routes each call
`prepareOutboundMessage(...)` and then `sendMessage({ data: { ...msg, pow } })`.

`encryptMessage` and `encryptSecretMessage` stay as internal functions
(they work with WebBuf). The helper is the boundary where WebBuf → hex happens.

For vault sharing (`vault.$id.tsx`), a parallel
`prepareOutboundSecretMessage(params & { secret })` uses `encryptSecretMessage`
internally.

#### F. Remove `as string` casts (finding 6)

The `as string` casts in route components come from server function return
types where Drizzle's `WebBuf` columns are converted to hex strings via
`.toHex()` but TypeScript infers the return as a union or generic type.

After step E, routes no longer directly touch key hex strings — they pass
key objects to `prepareOutboundMessage`. The remaining `as string` casts (if
any) get fixed by adding explicit return type annotations to the server
functions that return key data (`getMyKeys`, `getMyActiveKey`, etc.).

### Verification

- `bun run db:clear && bun run db:push` — schema pushes cleanly
- `bun run typecheck` — zero errors, no `as string` in app code
- `bun run lint` — zero errors
- `bun run test` — passes
- Manual: create account on keypears.test, send message to user on
  keypears.passapples.test (cross-domain), verify delivery both directions
- Manual: rotate keys on recipient, send message encrypted to old key set,
  verify it's accepted (keyNumber match)
- Manual: create and share a vault entry
