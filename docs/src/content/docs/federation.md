---
title: Federation
description: How KeyPears domains discover each other and exchange messages.
---

KeyPears is a federated protocol. Any domain can host a KeyPears server, and
users across different domains can communicate seamlessly. The model is
analogous to email: your address is `name@domain`, and the domain determines
where your data lives.

## Discovery: keypears.json

When a server needs to interact with a user on another domain, it fetches the
well-known configuration:

```
GET https://{domain}/.well-known/keypears.json
```

Response:

```json
{
  "apiDomain": "keypears.acme.com"
}
```

| Field       | Type   | Description                                 |
| ----------- | ------ | ------------------------------------------- |
| `apiDomain` | string | Domain hosting the KeyPears API (at `/api`) |
| `admin`     | string | (Optional) Admin's full KeyPears address    |

The API URL is derived as `https://{apiDomain}/api`. All server-to-server
communication goes through this endpoint.

## Three deployment patterns

### 1. Self-hosted

The address domain and API domain are the same. Users sign up directly at the
domain.

```json
// acme.com/.well-known/keypears.json
{ "apiDomain": "acme.com" }
```

Users get addresses like `alice@acme.com` and the API is at
`https://acme.com/api`.

### 2. Subdomain

A business runs the KeyPears API on a subdomain, keeping the main domain free
for other uses.

```json
// acme.com/.well-known/keypears.json
{ "apiDomain": "keypears.acme.com" }
```

Users have `@acme.com` addresses but the API runs at
`https://keypears.acme.com/api`.

### 3. Third-party hosted

A domain owner delegates their KeyPears service to another operator entirely.

```json
// acme.com/.well-known/keypears.json
{
  "apiDomain": "keypears.com",
  "admin": "acme-admin@keypears.com"
}
```

The `admin` field names an existing KeyPears user who can manage users for this
domain. The admin is verified against `keypears.json` on every privileged action.
If the `admin` field changes, the old admin immediately loses access.

## Pull-model message delivery

Cross-domain messages use a pull model rather than server-to-server push.

When `alice@a.com` sends a message to `bob@b.com`:

1. **Client sends to own server** — Alice's client calls `sendMessage` on her
   server with the encrypted message and recipient address.

2. **Sender's server stores locally** — Alice's server stores her copy of the
   message in her channel view.

3. **Sender's server creates pending delivery** — The message is stored in a
   `pending_deliveries` table with a random pull token (24-hour expiry). Only the
   BLAKE3 hash of the token is stored.

4. **Sender's server notifies recipient** — Alice's server calls `notifyMessage`
   on Bob's server with the pull token and a proof-of-work solution (mined by
   Alice's client).

5. **Recipient verifies sender domain** — Bob's server independently resolves
   `a.com/.well-known/keypears.json` to discover Alice's API URL. TLS guarantees
   the response came from the real domain.

6. **Recipient pulls message** — Bob's server calls `pullMessage` on Alice's
   server (at the verified API URL) with the token. The pull is idempotent — if
   Bob's server fails mid-delivery, it can retry with the same token. Pending
   deliveries expire and are cleaned up automatically.

7. **Recipient stores** — Bob's server verifies the message matches the
   notification, then stores it in Bob's channel view.

### Why pull, not push?

The pull model provides **domain verification without signing keys**:

- The recipient independently discovers the sender's API URL via DNS + TLS.
- The sender can't provide a fake API URL — the recipient resolves it themselves.
- No server signing keys, no key exchange, no certificate management.
- Authentication comes from HTTPS/TLS — the same trust model the web uses.

Because the pull happens synchronously during the send, the sender receives
immediate confirmation of delivery or an immediate error. There is no outbox
queue, no silent retry, and no delayed bounce notification.

## API procedures

All server-to-server communication uses oRPC — a type-safe RPC framework. The
API is mounted at `/api` and provides the following public procedures:

| Procedure          | Description                                                   |
| ------------------ | ------------------------------------------------------------- |
| `serverInfo`       | Returns domain info                                           |
| `getPublicKey`     | Returns active public key for an address                      |
| `getPowChallenge`  | Issues an authenticated PoW challenge (requires sender signature) |
| `notifyMessage`    | Notifies server of a new incoming message                     |
| `pullMessage`      | Serves a pending message delivery (idempotent, token-based)   |

## Migration

Because identity is bound to the domain (not the hosting provider), migrating
between hosting arrangements is straightforward:

1. Export data from the old server (users, keys, messages).
2. Import data into the new server.
3. Update `keypears.json` to point to the new API domain.
4. Users keep their addresses — `alice@acme.com` still works.

This works for any migration path: hosted → self-hosted, self-hosted → hosted,
or self-hosted → different self-hosted.
