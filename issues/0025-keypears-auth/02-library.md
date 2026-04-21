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
Zod schemas for all 5 existing oRPC endpoints (runtime validation + inferred
TypeScript types), provide a client factory, and replace the internal federation
call sites with the new package.

### Package structure

```
packages/client/
  package.json        # name: @keypears/client
  tsconfig.json
  src/
    index.ts          # re-exports public API
    schemas.ts        # Zod schemas for all oRPC endpoint inputs/outputs
    client.ts         # createKeypearsClient(apiDomain) factory
    discover.ts       # discoverApiDomain(domain) — fetch keypears.json
```

### Dependencies

- `zod` — schemas are the source of truth for the protocol contract
- `@orpc/client` — oRPC client and RPCLink
- `@webbuf/p256` — P-256 public key handling (for auth verification later)

### Zod schemas (`schemas.ts`)

Define Zod schemas for each endpoint's input and output. These are the single
source of truth for the protocol contract — both the server and client import
them. TypeScript types are inferred with `z.infer<>`.

```typescript
import { z } from "zod";

// --- serverInfo ---
export const serverInfoOutputSchema = z.object({
  domain: z.string(),
});
export type ServerInfoOutput = z.infer<typeof serverInfoOutputSchema>;

// --- getPublicKey ---
export const getPublicKeyInputSchema = z.object({
  address: z.string(),
});
export const getPublicKeyOutputSchema = z.object({
  publicKey: z.string().nullable(),
});
export type GetPublicKeyInput = z.infer<typeof getPublicKeyInputSchema>;
export type GetPublicKeyOutput = z.infer<typeof getPublicKeyOutputSchema>;

// --- getPowChallenge ---
export const getPowChallengeInputSchema = z.object({
  senderAddress: z.string(),
  recipientAddress: z.string(),
  senderPubKey: z.string(),
  signature: z.string(),
  timestamp: z.number(),
});
export const getPowChallengeOutputSchema = z.object({
  solvedHeader: z.string(),
  target: z.string(),
  expiresAt: z.number(),
  signature: z.string(),
});
export type GetPowChallengeInput = z.infer<typeof getPowChallengeInputSchema>;
export type GetPowChallengeOutput = z.infer<typeof getPowChallengeOutputSchema>;

// --- notifyMessage ---
export const notifyMessageInputSchema = z.object({
  senderAddress: z.string(),
  recipientAddress: z.string(),
  pullToken: z.string(),
  pow: z.object({
    solvedHeader: z.string(),
    target: z.string(),
    expiresAt: z.number(),
    signature: z.string(),
  }),
});
export const notifyMessageOutputSchema = z.object({
  success: z.literal(true),
});
export type NotifyMessageInput = z.infer<typeof notifyMessageInputSchema>;
export type NotifyMessageOutput = z.infer<typeof notifyMessageOutputSchema>;

// --- pullMessage ---
export const pullMessageInputSchema = z.object({
  token: z.string(),
});
export const pullMessageOutputSchema = z.object({
  senderAddress: z.string(),
  recipientAddress: z.string(),
  encryptedContent: z.string(),
  senderPubKey: z.string(),
  recipientPubKey: z.string(),
});
export type PullMessageInput = z.infer<typeof pullMessageInputSchema>;
export type PullMessageOutput = z.infer<typeof pullMessageOutputSchema>;
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

The return type will need to conform to the schema-inferred types. Investigate
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

**Server uses the client's Zod schemas directly.** The server's `api.router.ts`
imports the input schemas from `@keypears/client` and uses them in `.input()`
calls. The output types are enforced via explicit return type annotations from
the client's inferred types. This ensures a single source of truth — if a schema
changes in the client, the server gets a compile error.

```typescript
import {
  getPublicKeyInputSchema,
  type GetPublicKeyOutput,
} from "@keypears/client";

const getPublicKey = os
  .input(getPublicKeyInputSchema)
  .handler(async ({ input }): Promise<GetPublicKeyOutput> => { ... });
```

**Replace 6 remote client call sites:**

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
6. **`api.router.ts:notifyMessage`** — creates an ad-hoc client to call
   `.pullMessage()`. Replace with `createKeypearsClient()`.

### Testing

- Verify the keypears dev server still works after the refactor: federation
  messaging, public key lookup, PoW challenges.
- Verify `discoverApiDomain` works against the dev server's
  `/.well-known/keypears.json`.

### Result: Pending
