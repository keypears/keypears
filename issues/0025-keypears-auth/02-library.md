# Build `@keypears/client` and integrate auth into RSS Anyway

## Goal

Build `@keypears/client` — a typed client package for the KeyPears federation
API. This is the public interface to the KeyPears protocol. It defines the type
definitions for the oRPC API, provides a client factory for any KeyPears server,
and includes auth functions for third-party sign-in. RSS Anyway is the first
consumer.

## Context

The KeyPears `/sign` page is implemented (see [01-init.md](01-init.md),
Experiment 4). The federation API has 5 oRPC endpoints (`serverInfo`,
`getPublicKey`, `getPowChallenge`, `notifyMessage`, `pullMessage`). Currently,
the only consumers are internal — `federation.server.ts` and `api.router.ts`
create ad-hoc oRPC clients with types inferred from
`RouterClient<typeof
apiRouter>`. Third-party apps cannot use these because
they'd need to depend on the server.

The client package flips this: types are defined in the client, the server
imports and conforms to them, and third-party apps import the client directly.

## Experiment 1: Build `@keypears/client` with oRPC contract

### Goal

Create `packages/client/` in the keypears monorepo as `@keypears/client`. Define
an oRPC contract for all 5 existing federation endpoints, provide a typed client
factory, and replace the internal federation call sites with the new package.

### Why oRPC contracts

oRPC has a first-class "contract" concept (`@orpc/contract`) designed for
exactly this: define the API contract in a shared package, the server implements
it with runtime enforcement, and the client gets typed access from just the
contract — no server import needed.

- **`oc`** from `@orpc/contract` defines procedures with `.input()` and
  `.output()` Zod schemas.
- **`implement(contract)`** on the server replaces `os` and enforces the
  contract at both compile time and runtime.
- **`ContractRouterClient<typeof contract>`** on the client gives a fully typed
  client from just the contract.

This is cleaner than raw Zod schemas with manual return type annotations. The
contract IS the Zod schemas, structured as oRPC understands them.

### Package structure

```
packages/client/
  package.json        # name: @keypears/client
  tsconfig.json
  src/
    index.ts          # re-exports public API
    contract.ts       # oRPC contract for all federation endpoints
    client.ts         # createKeypearsClient(apiDomain) factory
    discover.ts       # discoverApiDomain(domain) — fetch keypears.json
```

### Dependencies

- `zod` — schemas within the contract
- `@orpc/contract` — oRPC contract definition (`oc`, `ContractRouterClient`)
- `@orpc/client` — oRPC client and RPCLink
- `@webbuf/p256` — P-256 public key handling (for auth verification later)

### Contract (`contract.ts`)

```typescript
import { oc } from "@orpc/contract";
import { z } from "zod";

const serverInfo = oc.output(z.object({
  domain: z.string(),
}));

const getPublicKey = oc
  .input(z.object({ address: z.string() }))
  .output(z.object({ publicKey: z.string().nullable() }));

const getPowChallenge = oc
  .input(z.object({
    senderAddress: z.string(),
    recipientAddress: z.string(),
    senderPubKey: z.string(),
    signature: z.string(),
    timestamp: z.number(),
  }))
  .output(z.object({
    solvedHeader: z.string(),
    target: z.string(),
    expiresAt: z.number(),
    signature: z.string(),
  }));

const notifyMessage = oc
  .input(z.object({
    senderAddress: z.string(),
    recipientAddress: z.string(),
    pullToken: z.string(),
    pow: z.object({
      solvedHeader: z.string(),
      target: z.string(),
      expiresAt: z.number(),
      signature: z.string(),
    }),
  }))
  .output(z.object({ success: z.literal(true) }));

const pullMessage = oc
  .input(z.object({ token: z.string() }))
  .output(z.object({
    senderAddress: z.string(),
    recipientAddress: z.string(),
    encryptedContent: z.string(),
    senderPubKey: z.string(),
    recipientPubKey: z.string(),
  }));

export const contract = {
  serverInfo,
  getPublicKey,
  getPowChallenge,
  notifyMessage,
  pullMessage,
};
```

### Client factory (`client.ts`)

```typescript
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { contract } from "./contract";

export type KeypearsClient = ContractRouterClient<typeof contract>;

export function createKeypearsClient(apiDomain: string): KeypearsClient {
  const link = new RPCLink({ url: `https://${apiDomain}/api` });
  return createORPCClient(link);
}
```

The client is fully typed from the contract alone — no server import needed.
Third-party apps import `createKeypearsClient` and get typed access to all
federation endpoints.

### Discovery (`discover.ts`)

```typescript
export async function discoverApiDomain(domain: string): Promise<string>
```

Fetch `https://${domain}/.well-known/keypears.json`, parse JSON, return
`apiDomain`. Throw on failure.

### Integration into the keypears server

**Server implements the contract.** Replace `os` from `@orpc/server` with
`implement(contract)` from `@orpc/contract`:

```typescript
import { implement } from "@orpc/server";
import { contract } from "@keypears/client";

const os = implement(contract);

const getPublicKey = os.getPublicKey.handler(async ({ input }) => {
  // input is typed from the contract's input schema
  // return type is enforced by the contract's output schema
  const parsed = parseAddress(input.address);
  if (!parsed) return { publicKey: null };
  // ...
});

export const apiRouter = os.router({
  serverInfo,
  getPublicKey,
  getPowChallenge: getPowChallengeEndpoint,
  notifyMessage,
  pullMessage,
});
```

The `.router()` call enforces that every contract procedure is implemented and
that inputs/outputs match the schemas — both at compile time and runtime.

**Replace 6 remote client call sites** in `federation.server.ts` and
`api.router.ts`:

1. **`federation.server.ts:createRemoteClient()`** — replace with
   `createKeypearsClient()` from `@keypears/client`.
2. **`federation.server.ts:fetchRemotePublicKey()`** — uses the client.
3. **`federation.server.ts:fetchRemotePowChallenge()`** — uses the client.
4. **`federation.server.ts:deliverRemoteMessage()`** — uses the client.
5. **`api.router.ts:getPowChallengeEndpoint`** — ad-hoc client replaced.
6. **`api.router.ts:notifyMessage`** — ad-hoc client replaced.

All 6 call sites replace inline `createORPCClient` + manual type annotations
with `createKeypearsClient()` which returns a `KeypearsClient` typed from the
contract.

### Testing

- Verify the keypears dev server still works after the refactor: federation
  messaging, public key lookup, PoW challenges.
- Verify `discoverApiDomain` works against the dev server's
  `/.well-known/keypears.json`.

### Result: Pass

Package created at `packages/client/`. Contract defines all 5 federation
endpoints. Server uses `implement(contract)` with runtime input/output
validation. All 6 ad-hoc client call sites replaced. One fix needed post-merge:
`getPowChallenge` output schema had wrong field names (`solvedHeader` vs
`header`) and was missing fields — the contract's runtime output validation
caught it immediately.

## Experiment 2: Add auth functions to `@keypears/client`

### Goal

Add `buildSignUrl`, `verifyCallback`, and `generateState` to `packages/client/`.
These are the three functions a third-party app calls to integrate KeyPears
sign-in. They build on `discoverApiDomain` and `getPublicKey` which are already
in the package.

### New files

```
packages/client/src/
  auth.ts             # buildSignUrl, verifyCallback, generateState
  canonical.ts        # buildCanonicalPayload (shared with /sign page)
```

### `generateState(): string`

Generate a cryptographically random 32-byte hex string. The app stores this in
its session before redirecting.

```typescript
export function generateState(): string {
  return FixedBuf.fromRandom(32).buf.toHex();
}
```

### `buildSignUrl(options): string`

Construct the URL to redirect the user to for signing.

```typescript
export function buildSignUrl(options: {
  apiDomain: string;
  domain: string;
  redirectUri: string;
  state: string;
  data?: string;
}): string
```

Builds
`https://${apiDomain}/sign?type=sign-in&domain=...&redirect_uri=...&state=...&data=...`.

### `verifyCallback(options): Promise<{ address: string }>`

Verify a callback from the `/sign` page. This is the core security function.

```typescript
export async function verifyCallback(options: {
  params: URLSearchParams | Record<string, string>;
  domain: string;
  state: string;
  data?: string;
}): Promise<{ address: string }>
```

Steps:

1. Extract from params: `signature`, `address`, `nonce`, `timestamp`, `expires`,
   `data`, `state`, `error`.
2. If `error` is present, throw (e.g. `"access_denied"`).
3. Verify `state` matches `options.state`.
4. Verify `data` matches `options.data` (if provided).
5. Check `expires` is still in the future.
6. Reconstruct the canonical JSON payload using `buildCanonicalPayload` with the
   callback params + `options.domain`.
7. Parse `address` to get the user's domain, call `discoverApiDomain` to find
   the API domain, then call `getPublicKey` via the oRPC client to get the
   user's compressed P-256 public key.
8. Decompress the public key using `@webbuf/p256` (`p256PublicKeyToJwk`), import
   into Web Crypto as an ECDSA verify key.
9. Decode the base64url signature back to bytes.
10. Verify the P-256 ECDSA (SHA-256) signature over the canonical JSON bytes.
11. If valid, return `{ address }`.
12. If any step fails, throw a descriptive error.

### `buildCanonicalPayload` (`canonical.ts`)

Extract the canonical payload logic from `sign.tsx` into a shared function. Both
the `/sign` page and `verifyCallback` must produce identical bytes for the same
inputs.

```typescript
export function buildCanonicalPayload(fields: {
  type: string;
  domain: string;
  address: string;
  nonce: string;
  timestamp: string;
  expires: string;
  data?: string;
}): string
```

Builds a JSON object with keys sorted alphabetically, omitting `data` if not
provided. Returns `JSON.stringify(sorted)`.

After creating this in the client, update `sign.tsx` to import and use it
instead of its local copy. This ensures both sides always agree on the payload
format.

### Exports

Update `packages/client/src/index.ts` to export:

- `buildSignUrl`
- `verifyCallback`
- `generateState`
- `buildCanonicalPayload`

### Testing

- Unit test `buildCanonicalPayload`: deterministic output, sorted keys, data
  omission.
- Unit test `buildSignUrl`: correct URL construction.
- Unit test `verifyCallback`: generate a real P-256 key pair with Web Crypto,
  sign a canonical payload, mock `fetch` for `keypears.json` and `getPublicKey`
  oRPC call, verify the library accepts the signature. Also test rejection
  cases: bad state, expired, bad signature, `error=access_denied`.

### Result: Pending
