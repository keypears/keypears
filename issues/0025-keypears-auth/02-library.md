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

## Experiment 2: Migrate all server functions to oRPC contract

### Goal

Move all 54 TanStack Start `createServerFn` functions into the oRPC contract and
router. After this, the entire KeyPears API is defined in `@keypears/client`'s
contract. The webapp's route loaders and UI call the same oRPC endpoints that
external clients use. No split brain between internal server functions and the
public API.

### Approach

The migration is mechanical — each server function already works. The steps per
function are:

1. Add the input/output Zod schemas to the contract in
   `packages/client/src/contract.ts`.
2. Add the handler to the router in `webapp/src/server/api.router.ts` using
   `os.<name>.handler(...)`.
3. Update the call site (route loader, component, or other server function) to
   use the oRPC client instead of importing the server function directly.

### Contract organization

Group procedures by domain in the contract. The contract object becomes nested:

```typescript
export const contract = {
  // Federation (already done)
  serverInfo,
  getPublicKey,
  getPowChallenge,
  notifyMessage,
  pullMessage,

  // Account
  createUser,
  login,
  logout,
  saveUser,
  deleteUser,
  checkNameAvailable,
  isRegistrationOpen,

  // Keys
  rotateKey,
  getMyKeys,
  getMyEncryptedKeys,
  changePassword,
  reEncryptKey,
  getMyActiveEncryptedKey,

  // Profile
  getMyUser,
  getProfile,
  getPublicKeyForAddress,

  // Messaging
  sendMessage,
  getMyChannels,
  getMessagesForChannel,
  getOlderMessages,
  pollNewMessages,
  markChannelAsRead,
  getMyUnreadCount,
  getRemotePowChallenge,

  // Vault
  createVaultEntry,
  getMyVaultEntries,
  getVaultEntry,
  updateVaultEntry,
  deleteVaultEntry,
  deleteSecret,
  getVaultHistory,

  // PoW
  getRegistrationPowChallenge,
  getLoginPowChallenge,
  getChannelPowChallenge,
  verifyPow,

  // Settings
  getMyPowSettings,
  updateMyPowSettings,

  // Domain admin
  claimDomain,
  getMyDomains,
  getDomainUsers,
  createDomainUser,
  resetDomainUserPassword,
  adminCheckNameAvailable,
  toggleOpenRegistration,
  toggleAllowThirdPartyDomains,

  // Config
  getServerDomain,
  getServerApiDomain,
  getKeypearsJson,
  getPowHistory,

  // Content
  getBlogPosts,
  getBlogPost,
  getPrivacyPolicy,
  getTermsOfService,
};
```

### Auth handling

Currently, authenticated server functions use TanStack Start's `authMiddleware`
which reads session cookies. The oRPC router needs the same auth mechanism. Two
approaches:

1. **oRPC middleware**: add an oRPC middleware that reads the session cookie
   from the request headers and attaches `userId` to context. Authenticated
   handlers read `context.userId`.
2. **Direct cookie reading**: handlers that need auth call `getSessionUserId()`
   directly, same as the current no-middleware server functions.

Option 1 is cleaner — it mirrors the existing TanStack Start auth middleware
pattern. The oRPC `RPCHandler` already receives the full `Request` object, so
cookies are accessible.

### Call site migration

The webapp's route loaders and components currently import server functions
directly:

```typescript
// Before
import { getMyUser } from "~/server/user.functions";
const user = await getMyUser();
```

After migration, they call the oRPC endpoint. For internal webapp calls (same
server), this can be a direct function call to the handler rather than an HTTP
round-trip. Investigate whether oRPC supports direct/in-process calls to avoid
the overhead of serializing to HTTP when the caller and handler are in the same
process.

If not, the simplest approach: keep thin wrapper functions that call the handler
logic directly for internal use, while the oRPC endpoint exposes the same logic
externally. The server function files become thin wrappers around the router
handlers.

### Migration order

Migrate in dependency order — functions that other functions depend on go first:

1. **Config** — `getServerDomain`, `getServerApiDomain` (no deps, used by many)
2. **PoW** — challenge generation and verification (used by account + messaging)
3. **Account** — create, login, logout, save (used by everything auth-gated)
4. **Keys** — rotation, encryption key management
5. **Profile** — user lookup
6. **Messaging** — send, channels, polling
7. **Vault** — CRUD operations
8. **Settings** — PoW settings
9. **Domain admin** — admin operations
10. **Content** — blog, privacy, terms

### Testing

After each group, verify:

- Typecheck passes (`bun run typecheck`)
- Lint passes (`bun run lint`)
- Tests pass (`bun run test`)
- Manual smoke test: create account, login, send message, create vault entry

### What NOT to change

- The contract and router handle the API. Route files (`routes/*.tsx`) stay as
  TanStack Router routes — they just call oRPC endpoints in their loaders
  instead of importing server functions.
- The existing `server/*.server.ts` files (DB logic) stay unchanged — they're
  the implementation layer that handlers call.

### Result: Pending
