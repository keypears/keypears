# Federation

KeyPears is a federated protocol. Any domain can host a KeyPears server, and
users across different domains can communicate seamlessly. The model is
analogous to email: your address is `name@domain.com`, and the domain
determines where your data lives.

## Three Deployment Patterns

### 1. Primary Self-Hosted (keypears.com)

Users sign up at keypears.com and get an address like `alice@keypears.com`.
Zero setup, no email required, fully anonymous. Registration is PoW-gated to
prevent spam. The address domain and API domain are the same.

### 2. Subdomain Self-Hosted (Custom Domain)

A business owns `acme.com` and wants their users to have addresses like
`alice@acme.com`. They run a KeyPears server on a subdomain:

1. Run a KeyPears server at `keypears.acme.com`
2. Add `keypears.json` to `acme.com`:

```
https://acme.com/.well-known/keypears.json
```

```json
{
  "apiDomain": "keypears.acme.com"
}
```

The address domain (`acme.com`) differs from the API domain
(`keypears.acme.com`). Users have `@acme.com` addresses but log in at
`keypears.acme.com`. The main `acme.com` domain stays the business's
website.

### 3. Third-Party Hosted (Custom Domain, No Server)

A domain owner doesn't run any server. They put a `keypears.json` on their
domain pointing to a hosted KeyPears instance:

```json
{
  "apiDomain": "keypears.com",
  "admin": "acme@keypears.com"
}
```

The `admin` field names an existing KeyPears user who can manage users for
this domain. Users at `@acme.com` are served by the keypears.com server.
Like Google Workspace with a custom domain.

The admin is verified against `keypears.json` on every privileged action
(creating users, resetting passwords). If the `admin` field changes, the
old admin immediately loses access.

## Address Format

A KeyPears address is `name@domain`:

- **name** — a lowercase alphanumeric string (1-30 chars, starts with a letter)
- **domain** — the domain that hosts the user's `keypears.json`

The address is the user's identity. It does not change even if the hosting
provider changes, because the domain stays the same and only the
`keypears.json` file is updated.

## Server Configuration

A server needs two domain env vars:

| Setting | Description | Example |
|---------|-------------|---------|
| `KEYPEARS_DOMAIN` | Address domain (goes after `@`) | `acme.com` |
| `KEYPEARS_API_DOMAIN` | Where this server's API runs | `keypears.acme.com` |
| `KEYPEARS_SECRET` | Master secret for PoW signing keys | 64-char hex |

For primary self-hosted servers, both domains are the same. For subdomain
deployments, they differ.

## Discovery: keypears.json

When a server needs to interact with a user on another domain, it fetches
the well-known configuration:

```
GET https://{domain}/.well-known/keypears.json
```

Response:

```json
{
  "apiDomain": "example.com"
}
```

| Field      | Type   | Description                                    |
|------------|--------|------------------------------------------------|
| apiDomain  | string | Domain hosting the KeyPears API (at `/api`)    |
| admin      | string | (Optional) Admin's full KeyPears address       |

The API URL is derived as `https://{apiDomain}/api`. All server-to-server
communication — key discovery, message delivery, PoW challenges — goes
through oRPC procedures at this URL.

### Caching

Servers should cache `keypears.json` responses. The file changes rarely
(only when migrating hosting). A TTL of 1 hour is reasonable. On error,
fall back to the cached value.

## Wire Protocol: oRPC

All server-to-server communication uses **oRPC** — a type-safe RPC
framework with Zod validation. The API is mounted at `/api` and provides
the following public procedures:

| Procedure | Description |
|-----------|-------------|
| `serverInfo` | Returns domain info |
| `getPublicKey` | Returns active public key for an address |
| `getPowChallenge` | Issues a PoW challenge for messaging |
| `notifyMessage` | Notifies server of a new incoming message |
| `pullMessage` | Serves a pending message delivery (one-time token) |

## Key Discovery

To find a user's current public key, the sender's server calls the
recipient's server via oRPC:

```typescript
const client = createRemoteClient(recipientApiUrl);
const result = await client.getPublicKey({ address: "alice@acme.com" });
// result.publicKey = "02abc...def"
```

The server returns the user's **active** public key (the most recently
rotated secp256k1 key). This is used to compute the ECDH shared secret
for encryption.

## Message Delivery

### Same Domain

When sender and recipient are on the same server (including different
hosted domains on the same server), messages are stored directly. Each
user has their own copy of the message in their own channel view.

### Cross Domain (Pull Model)

All cross-domain communication is server-to-server. The client only talks
to its own server. This avoids CORS and simplifies the client.

When `alice@acme.com` sends a message to `bob@other.com`:

1. **Client sends to own server** — Alice's client calls `sendMessage` on
   Alice's server with the encrypted message and recipient address.

2. **Sender's server stores locally** — Alice's server stores Alice's copy
   of the message in her channel view.

3. **Sender's server creates pending delivery** — The message is stored in
   a `pending_deliveries` table with a random one-time token. Only the
   BLAKE3 hash of the token is stored.

4. **Sender's server notifies recipient** — Alice's server calls
   `notifyMessage` on Bob's server via oRPC with:
   - `senderAddress`: `alice@acme.com`
   - `recipientAddress`: `bob@other.com`
   - `pullToken`: the one-time token
   - `pow`: proof of work solution (mined by Alice's browser)

5. **Recipient verifies sender domain** — Bob's server parses the sender
   address, extracts the domain (`acme.com`), fetches
   `acme.com/.well-known/keypears.json` to discover the API URL. This
   ensures the sender can't spoof another domain — TLS guarantees the
   response came from the real domain.

6. **Recipient pulls message** — Bob's server calls `pullMessage` on
   Alice's server (at the verified API URL) with the token. The message is
   returned and the pending delivery is deleted (one-time use).

7. **Recipient verifies and stores** — Bob's server verifies the sender and
   recipient addresses match the notification, then stores the message in
   Bob's channel view.

### Why Pull Model?

The pull model provides **domain verification without signing keys**:

- The recipient independently discovers the sender's API URL via DNS + TLS
- The sender can't provide a fake API URL — the recipient resolves it
  themselves from the sender's domain
- No server signing keys, no key exchange, no certificate management
- Authentication comes from HTTPS/TLS — the same trust model the web uses

The one-time token prevents unauthorized access to pending messages. Only
the server that received the `notifyMessage` call has the token.

### Message Structure

Each message stored on the server contains:

| Field            | Description                                    |
|------------------|------------------------------------------------|
| senderAddress    | Full address (e.g. `alice@acme.com`)           |
| encryptedContent | ACS2-encrypted message (hex)                   |
| senderPubKey     | Sender's public key at time of sending         |
| recipientPubKey  | Recipient's public key at time of sending      |
| isRead           | Whether the recipient has viewed this message  |

Both public keys are stored so the recipient knows which keys to use for
ECDH decryption, even after key rotation.

## Proof of Work

### Registration PoW

Account creation requires proof-of-work (difficulty 70M). This prevents
mass account creation without requiring email or any identifying
information.

PoW challenges are signed with BLAKE3 MAC (derived from `KEYPEARS_SECRET`).
They are stateless — no database entry is created until the PoW is verified.
Solutions are tracked in `used_pow` for replay prevention.

### Message PoW

Every message requires proof-of-work (difficulty 7M) from the recipient's
server. The client mines PoW on WebGPU before sending. Servers never mine.

### Login PoW

Each login attempt requires PoW (difficulty 7M). This throttles brute-force
password attacks without rate limiting or account lockouts.

## Migration

### Hosted → Self-Hosted

1. Export data from keypears.com (users, keys, messages)
2. Import data into self-hosted server at `keypears.acme.com`
3. Update `acme.com/.well-known/keypears.json` to point to
   `keypears.acme.com`
4. Users keep their addresses — `alice@acme.com` still works

### Self-Hosted → Hosted

The reverse: export from self-hosted, import to keypears.com, update
`keypears.json` to point to `keypears.com`.

### Self-Hosted → Different Self-Hosted

Same process. The address never changes because it's tied to the domain,
not the hosting provider.

## Security Properties

**End-to-end encryption** — Messages are encrypted client-side before
delivery. Neither the sender's server nor the recipient's server can read
message content. They only store ciphertext.

**No central authority** — Any domain can participate. There is no
registration process for domains. If you can serve a `keypears.json` file,
you can join the federation.

**Domain verification via TLS** — Cross-domain messages are authenticated
by the recipient independently resolving the sender's domain. No server
signing keys or certificates needed beyond standard HTTPS.

**PoW-gated messaging** — Every message requires proof of work. Difficulty
is set by the recipient's server.

**Forward secrecy via key rotation** — Users can rotate keys at any time.
Old messages remain encrypted with old keys. New messages use the current
key. The protocol handles key transitions gracefully by storing both
sender and recipient public keys per message.

**Privacy-preserving by default** — keypears.com requires no email, no
phone number, no identifying information. Business domains can use admin
user management, but that is a per-domain policy choice, not a protocol
requirement.
