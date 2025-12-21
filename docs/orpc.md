# oRPC API Architecture

KeyPears uses [oRPC](https://orpc.unnoq.com/) for type-safe API communication
between clients and servers. oRPC provides end-to-end TypeScript type safety
while being OpenAPI-compatible, enabling clients in any language.

## Overview

KeyPears follows a **contract-first** development approach:

1. **Contract** defines all API procedures with Zod schemas for input/output
2. **Client** uses the contract for type-safe API calls
3. **Server** implements the contract with handlers

This separation enables:

- Type-safe TypeScript clients with full autocomplete
- OpenAPI-compatible HTTP endpoints for other languages
- Clear API specification that can be shared independently

## Package Structure

```
@keypears/api-client     # Contract + client (no server dependencies)
├── contract.ts          # Procedure definitions with input/output schemas
├── schemas.ts           # Zod schemas for all requests/responses
├── client.ts            # Client factory functions
└── validation.ts        # Server discovery utilities

@keypears/api-server     # Server implementation (depends on api-client)
├── index.ts             # Router with all procedure handlers
└── procedures/          # Individual procedure implementations
    ├── base.ts          # Middleware layers (auth, context)
    └── *.ts             # One file per procedure
```

**Dependency graph:**

- `tauri-ts` → `@keypears/api-client` (no server deps like `pg`, `drizzle`)
- `webapp` → `@keypears/api-server` → `@keypears/api-client`

## Contract Definition

The contract uses a **flat structure** with 26 procedures at the root level:

```typescript
// api-client/src/contract.ts
import { oc } from "@orpc/contract";
import {
  CheckNameAvailabilityRequestSchema,
  CheckNameAvailabilityResponseSchema,
  // ... other schemas
} from "./schemas.js";

export const contract = {
  // Public endpoints (no authentication)
  checkNameAvailability: oc
    .input(CheckNameAvailabilityRequestSchema)
    .output(CheckNameAvailabilityResponseSchema),

  registerVault: oc
    .input(RegisterVaultRequestSchema)
    .output(RegisterVaultResponseSchema),

  login: oc.input(LoginRequestSchema).output(LoginResponseSchema),

  // Authenticated endpoints (require X-Vault-Session-Token header)
  getVaultInfo: oc
    .input(GetVaultInfoRequestSchema)
    .output(GetVaultInfoResponseSchema),

  createSecretUpdate: oc
    .input(CreateSecretUpdateRequestSchema)
    .output(CreateSecretUpdateResponseSchema),

  // ... 26 procedures total
};

export type Contract = typeof contract;
```

### Schema Pattern

Each procedure has request and response schemas defined with Zod:

```typescript
// api-client/src/schemas.ts
import { z } from "zod";

export const CheckNameAvailabilityRequestSchema = z.object({
  name: vaultNameSchema,
  domain: z.string().min(1).max(255),
});

export const CheckNameAvailabilityResponseSchema = z.object({
  available: z.boolean(),
  difficulty: z.number().optional(), // Only present when available is true
});
```

## Client Usage

### Creating a Client

**Option 1: Known URL**

```typescript
import { createClient } from "@keypears/api-client";

// Explicit URL (works in Node.js or browser)
const client = createClient({ url: "http://localhost:4273/api" });

// Auto-detect URL from browser location
const client = createClient();
```

**Option 2: Domain-based with service discovery (recommended)**

```typescript
import { createClientFromDomain } from "@keypears/api-client";

// Discovers API URL via .well-known/keypears.json
const client = await createClientFromDomain("keypears.com");
```

### Authenticated Requests

After login, pass the session token to create an authenticated client:

```typescript
// Login first
const client = await createClientFromDomain("keypears.com");
const loginResponse = await client.api.login({
  vaultId,
  loginKey: loginKeyHex,
  deviceId,
  clientDeviceDescription: "Chrome on macOS",
});

// Create authenticated client
const authedClient = await createClientFromDomain("keypears.com", {
  sessionToken: loginResponse.sessionToken,
});

// Now call authenticated endpoints
await authedClient.api.createSecretUpdate({
  vaultId,
  secretId,
  encryptedBlob,
  localOrder,
});
```

### Example: Registration Flow

```typescript
import { createClientFromDomain } from "@keypears/api-client";

async function registerVault(domain: string, name: string) {
  const client = await createClientFromDomain(domain);

  // 1. Check name availability
  const { available, difficulty } = await client.api.checkNameAvailability({
    name,
    domain,
  });
  if (!available) throw new Error("Name taken");

  // 2. Get PoW challenge
  const challenge = await client.api.getPowChallenge({
    difficulty,
    senderAddress: `${name}@${domain}`,
  });

  // 3. Solve PoW (client-side)
  const solution = await solvePoW(challenge);

  // 4. Register vault
  const { vaultId } = await client.api.registerVault({
    vaultId: generateId(),
    name,
    domain,
    vaultPubKeyHash,
    vaultPubKey,
    loginKey,
    encryptedVaultKey,
    challengeId: challenge.challengeId,
    solvedHeader: solution.header,
    hash: solution.hash,
  });

  return vaultId;
}
```

## Server Implementation

### Middleware Architecture

The server uses middleware stacking for authentication:

```typescript
// api-server/src/procedures/base.ts
import { os, ORPCError } from "@orpc/server";

// Layer 1: Extract auth headers from request
const executionContextBase = os.$context<{ headers: IncomingHttpHeaders }>()
  .use(async ({ context, next }) => {
    const sessionToken = context.headers["x-vault-session-token"];
    return next({ context: { ...context, sessionToken } });
  });

// Layer 2: Public base (no auth required)
export const base = executionContextBase;

// Layer 3: Session authentication
export const sessionAuthedProcedure = base.use(async ({ context, next }) => {
  if (!context.sessionToken) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Missing X-Vault-Session-Token header",
    });
  }

  // Validate session, get vault info
  const session = await validateSession(context.sessionToken);

  return next({
    context: { ...context, session, vaultId: session.vaultId },
  });
});
```

### Procedure Handlers

Procedures chain from the appropriate base and define handlers:

```typescript
// Public endpoint
export const checkNameAvailabilityProcedure = base
  .input(CheckNameAvailabilityRequestSchema)
  .output(CheckNameAvailabilityResponseSchema)
  .handler(async ({ input }) => {
    const { name, domain } = input;
    const available = await checkNameAvailability(name, domain);
    return { available, difficulty: available ? getDifficulty(name) : undefined };
  });

// Authenticated endpoint
export const createSecretUpdateProcedure = sessionAuthedProcedure
  .input(CreateSecretUpdateRequestSchema)
  .output(CreateSecretUpdateResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId } = context; // From session middleware
    // Verify input.vaultId matches session vaultId
    if (input.vaultId !== vaultId) {
      throw new ORPCError("FORBIDDEN", { message: "Vault mismatch" });
    }
    // ... create secret update
  });
```

## Implementing Clients in Other Languages

oRPC is HTTP-based and OpenAPI-compatible. Any language can call the API.

### Service Discovery

First, discover the API URL from the domain:

```
GET https://keypears.com/.well-known/keypears.json
```

Response:

```json
{
  "apiUrl": "https://api.keypears.com/api"
}
```

### HTTP Request Format

All procedures use `POST` with JSON body:

```
POST {apiUrl}/{procedureName}
Content-Type: application/json

{...request body...}
```

**Example: Check name availability**

```bash
curl -X POST https://api.keypears.com/api/checkNameAvailability \
  -H "Content-Type: application/json" \
  -d '{"name": "alice", "domain": "keypears.com"}'
```

Response:

```json
{ "available": true, "difficulty": 17 }
```

### Authentication Headers

Authenticated endpoints require the session token header:

```
X-Vault-Session-Token: {64-character hex token from login}
```

**Example: Authenticated request**

```bash
curl -X POST https://api.keypears.com/api/getSecretUpdates \
  -H "Content-Type: application/json" \
  -H "X-Vault-Session-Token: a1b2c3..." \
  -d '{"vaultId": "...", "sinceServerOrder": 0}'
```

### Error Responses

Errors return HTTP 4xx/5xx with JSON body:

```json
{
  "code": "UNAUTHORIZED",
  "message": "Missing X-Vault-Session-Token header"
}
```

Common error codes: `UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`,
`FORBIDDEN`

## API Reference

### Public Endpoints (No Authentication)

| Procedure                      | Description                          |
| ------------------------------ | ------------------------------------ |
| `checkNameAvailability`        | Check if vault name is available     |
| `registerVault`                | Register a new vault (requires PoW)  |
| `login`                        | Create a session                     |
| `logout`                       | Invalidate a session                 |
| `getVaultInfoPublic`           | Get public vault info (for import)   |
| `getPowChallenge`              | Get a proof-of-work challenge        |
| `verifyPowProof`               | Verify a PoW solution                |
| `getCounterpartyEngagementKey` | Get engagement key for key exchange  |
| `sendMessage`                  | Send encrypted message to another user |
| `verifyEngagementKeyOwnership` | Verify key ownership across domains  |

### Authenticated Endpoints (Require Session Token)

| Procedure                  | Description                              |
| -------------------------- | ---------------------------------------- |
| `getVaultInfo`             | Get vault info (authenticated)           |
| `createSecretUpdate`       | Create/update a secret                   |
| `getSecretUpdates`         | Fetch secret updates (for sync)          |
| `createEngagementKey`      | Create engagement key for messaging      |
| `getEngagementKeys`        | List engagement keys (paginated)         |
| `getDerivationPrivKey`     | Get derivation key for key derivation    |
| `getVaultSettings`         | Get vault settings                       |
| `updateVaultSettings`      | Update vault settings                    |
| `getEngagementKeyForSending` | Get/create key for outgoing messages   |
| `getChannels`              | List message channels                    |
| `getChannelMessages`       | Get messages in a channel                |
| `getEngagementKeyByPubKey` | Lookup key by public key (for decryption)|
| `getSenderChannel`         | Get channel for sent messages            |
| `getInboxMessagesForSync`  | Get inbox messages for sync              |
| `deleteInboxMessages`      | Delete synced inbox messages             |
| `updateChannelMinDifficulty` | Update channel spam protection         |

### Schema Reference

Full Zod schemas with field constraints are in `api-client/src/schemas.ts`.
Key patterns:

- Vault IDs: 26-char Crockford Base32 (UUIDv7)
- Public keys: 66-char hex (33-byte compressed secp256k1)
- Hashes: 64-char hex (32-byte Blake3 or SHA-256)
- Session tokens: 64-char hex (32 bytes)
