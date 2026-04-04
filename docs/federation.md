# Federation

KeyPears is a federated protocol. Any domain can host a KeyPears server, and
users across different domains can communicate seamlessly. The model is
analogous to email: your address is `name@domain.com`, and the domain
determines where your data lives.

## Three Tiers

### 1. keypears.com (Default)

Users sign up at keypears.com and get an address like `1@keypears.com`. Zero
setup, no email required, fully anonymous. Registration is PoW-gated to
prevent spam. Users can optionally claim a vanity name (e.g.
`ryan@keypears.com`) on a first-come-first-serve basis.

### 2. Hosted KeyPears (Custom Domain)

A business owns `acme.com` and wants their users to have addresses like
`alice@acme.com`. Setup is minimal:

1. Add `keypears.json` to their domain:

```
https://acme.com/.well-known/keypears.json
```

```json
{
  "version": 1,
  "apiUrl": "https://keypears.com/api"
}
```

2. That's it. Users sign up by verifying their `@acme.com` email address.
   Their KeyPears name matches their email prefix automatically.

All data is stored and served by keypears.com. Like Google Workspace with a
custom domain.

### 3. Self-Hosted

A business runs their own KeyPears server at `kp.acme.com`. Their
`keypears.json` points to their own server:

```json
{
  "version": 1,
  "apiUrl": "https://kp.acme.com/api"
}
```

The server is configured to require email auth for the domain. Users sign
up by verifying their `@acme.com` email. Full control over data,
infrastructure, and policies.

## Address Format

A KeyPears address is `name@domain`:

- **name** — a string identifier. On keypears.com, defaults to the numeric
  user ID (e.g. `1`, `42`) but can be changed to a vanity name. On business
  domains, matches the email prefix (e.g. `alice`, `bob`).
- **domain** — the domain that hosts the user's `keypears.json`

The address is the user's identity. It does not change even if the hosting
provider changes, because the domain stays the same and only the
`keypears.json` file is updated.

## Registration Modes

A KeyPears server supports two registration modes, configured per domain:

### Open Registration (keypears.com)

- No email required. Fully anonymous.
- Users get a numeric ID as their name (e.g. `1@keypears.com`).
- Registration is gated by proof-of-work to prevent spam.
- Users can optionally claim a vanity name (first-come-first-serve).

### Email-Authenticated Registration (Business Domains)

- Users must verify ownership of an email address on the domain.
- Their KeyPears name matches their email prefix automatically.
- No PoW required — email verification is the anti-spam mechanism.
- The domain admin only needs to set up `keypears.json` — no user
  provisioning. Users self-serve.

### Server Configuration

A server needs minimal configuration:

| Setting | Description | Example |
|---------|-------------|---------|
| `KEYPEARS_DOMAIN` | The user-facing domain for addresses | `acme.com` |
| `KEYPEARS_API_URL` | The URL where this server's API is hosted | `https://keypears.com/api` |
| `KEYPEARS_SECRET` | Master secret for deriving PoW signing keys | 64-char hex |

## Discovery: keypears.json

When a server needs to interact with a user on another domain, it fetches
the well-known configuration:

```
GET https://{domain}/.well-known/keypears.json
```

Response:

```json
{
  "version": 1,
  "apiUrl": "https://example.com/api"
}
```

| Field    | Type   | Description                              |
|----------|--------|------------------------------------------|
| version  | number | Protocol version (currently 1)           |
| apiUrl   | string | Base URL for all oRPC API calls          |

The `apiUrl` is the single entry point for all server-to-server
communication. All operations — key discovery, message delivery, PoW
challenges — go through oRPC procedures at this URL.

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
| `serverInfo` | Returns domain and API URL |
| `getPublicKey` | Returns active public key for an address |
| `getPowChallenge` | Issues a PoW challenge for channel opening |
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

When sender and recipient are on the same server, messages are stored
directly. Each user has their own copy of the message in their own channel
view. No cross-domain communication needed.

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
   SHA-256 hash of the token is stored.

4. **Sender's server notifies recipient** — Alice's server calls
   `notifyMessage` on Bob's server via oRPC with:
   - `senderAddress`: `alice@acme.com`
   - `recipientAddress`: `bob@other.com`
   - `pullToken`: the one-time token

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

### Registration PoW (Open Registration Only)

On servers with open registration (like keypears.com), account creation
requires proof-of-work. This prevents mass account creation without
requiring email or any identifying information.

PoW challenges are signed with HMAC (derived from `KEYPEARS_SECRET`). They
are stateless — no database entry is created until the PoW is verified.

### Channel PoW

Opening a new channel to any user (same domain or cross-domain) requires
proof-of-work. This prevents spam messaging. The PoW challenge is issued
by the **recipient's server**, because it is the one that needs protection.

Subsequent messages to the same recipient do not require PoW.

### Login PoW

Each login attempt requires a small amount of PoW. This throttles
brute-force password attacks without rate limiting or account lockouts.

## Migration

### Hosted → Self-Hosted

1. Export data from keypears.com (users, keys, messages)
2. Import data into self-hosted server at `kp.acme.com`
3. Update `acme.com/.well-known/keypears.json` to point to
   `https://kp.acme.com/api`
4. Users keep their addresses — `alice@acme.com` still works

### Self-Hosted → Hosted

The reverse: export from self-hosted, import to keypears.com, update
`keypears.json` to point to `https://keypears.com/api`.

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

**PoW-gated channels** — Spam protection is decentralized. Each server
sets its own PoW difficulty. A server under attack can raise its difficulty
independently.

**Forward secrecy via key rotation** — Users can rotate keys at any time.
Old messages remain encrypted with old keys. New messages use the current
key. The protocol handles key transitions gracefully by storing both
sender and recipient public keys per message.

**Privacy-preserving by default** — keypears.com requires no email, no
phone number, no identifying information. Business domains can require
email auth, but that is a per-domain policy choice, not a protocol
requirement.
