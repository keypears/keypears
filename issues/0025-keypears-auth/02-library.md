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

## Experiment 1: Build `@keypears/client` with federation API

### Goal

Create `packages/client/` in the keypears monorepo as `@keypears/client`. Define
type definitions for all 5 existing oRPC endpoints, provide a client factory,
and replace the internal federation call sites with the new package.

### Package structure

```
packages/client/
  package.json        # name: @keypears/client
  tsconfig.json
  src/
    index.ts          # re-exports public API
    types.ts          # type definitions for all oRPC endpoints
    client.ts         # createKeypearsClient(apiDomain) factory
    discover.ts       # discoverApiDomain(domain) — fetch keypears.json
```

### Dependencies

- `@orpc/client` — oRPC client and RPCLink
- `@webbuf/p256` — P-256 public key handling (for auth verification later)

### Type definitions (`types.ts`)

Define input/output types for each endpoint independently of the server's
router. These are the protocol's type contract:

```typescript
export interface ServerInfoOutput {
  domain: string;
}

export interface GetPublicKeyInput {
  address: string;
}
export interface GetPublicKeyOutput {
  publicKey: string | null;
}

export interface GetPowChallengeInput {
  senderAddress: string;
  recipientAddress: string;
  senderPubKey: string;
  signature: string;
  timestamp: number;
}
export interface GetPowChallengeOutput {
  solvedHeader: string;
  target: string;
  expiresAt: number;
  signature: string;
}

export interface NotifyMessageInput {
  senderAddress: string;
  recipientAddress: string;
  pullToken: string;
  pow: {
    solvedHeader: string;
    target: string;
    expiresAt: number;
    signature: string;
  };
}
export interface NotifyMessageOutput {
  success: true;
}

export interface PullMessageInput {
  token: string;
}
export interface PullMessageOutput {
  senderAddress: string;
  recipientAddress: string;
  encryptedContent: string;
  senderPubKey: string;
  recipientPubKey: string;
}
```

### Client factory (`client.ts`)

```typescript
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

export function createKeypearsClient(apiDomain: string) {
  const link = new RPCLink({ url: `https://${apiDomain}/api` });
  return createORPCClient(link);
}
```

The return type will need to conform to the type definitions. The exact
mechanism depends on how oRPC supports standalone type annotations — investigate
whether `createORPCClient` can be parameterized with a type, or whether we need
a typed wrapper.

### Discovery (`discover.ts`)

```typescript
export async function discoverApiDomain(domain: string): Promise<string>
```

Fetch `https://${domain}/.well-known/keypears.json`, parse JSON, return
`apiDomain`. Throw on failure. This is the same logic currently in
`federation.server.ts:fetchKeypearsJson` but extracted as a standalone function
without caching (the consuming app can cache if it wants).

### Integration into the keypears server

Replace 5 call sites:

1. **`federation.server.ts:createRemoteClient()`** — replace with
   `createKeypearsClient()` from `@keypears/client`.
2. **`federation.server.ts:fetchRemotePublicKey()`** — uses the client to call
   `.getPublicKey()`.
3. **`federation.server.ts:fetchRemotePowChallenge()`** — uses the client to
   call `.getPowChallenge()`.
4. **`federation.server.ts:deliverRemoteMessage()`** — uses the client to call
   `.notifyMessage()`.
5. **`api.router.ts:getPowChallengeEndpoint`** — creates an ad-hoc client to
   call `.getPublicKey()` on the sender's server. Replace with
   `createKeypearsClient()`.

The `api.router.ts:notifyMessage` handler also creates an ad-hoc client to call
`.pullMessage()` — replace that too (6 call sites total).

### Server type conformance

The server's `apiRouter` should be validated against the client's type
definitions. Investigate whether oRPC supports a pattern like:

```typescript
import type { GetPublicKeyInput, GetPublicKeyOutput } from "@keypears/client";

const getPublicKey = os
  .input(z.object({ address: z.string() }) satisfies ZodType<GetPublicKeyInput>)
  .handler(async ({ input }): Promise<GetPublicKeyOutput> => { ... });
```

The exact approach depends on oRPC's type system. The goal is compile-time
verification that the server's implementation matches the client's type
contract. If oRPC doesn't support this cleanly, explicit return type annotations
on the handlers are sufficient.

### Testing

- Verify the keypears dev server still works after the refactor: federation
  messaging, public key lookup, PoW challenges.
- Verify `discoverApiDomain` works against the dev server's
  `/.well-known/keypears.json`.

### Result: Pending
