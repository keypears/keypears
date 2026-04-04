# Federation

KeyPears is a federated protocol. Any domain can host a KeyPears server, and
users across different domains can communicate seamlessly. The model is
analogous to email: your address is `name@domain.com`, and the domain
determines where your data lives.

## Three Tiers

### 1. keypears.com (Default)

Users sign up at keypears.com and get an address like `1@keypears.com`. Zero
setup. This is the default experience, like using Gmail.

### 2. Hosted KeyPears (Custom Domain)

A business or individual owns `acme.com` and wants their users to have
addresses like `alice@acme.com`. They sign up for hosted KeyPears, which runs
on keypears.com infrastructure. They add a `keypears.json` file to their
domain that points to keypears.com:

```
https://acme.com/.well-known/keypears.json
```

```json
{
  "version": 1,
  "apiUrl": "https://keypears.com/api"
}
```

Users authenticate with `alice@acme.com` but all data is stored and served
by keypears.com. Like Google Workspace with a custom domain.

### 3. Self-Hosted

A business runs their own KeyPears server at `kp.acme.com`. Their users
have addresses like `alice@acme.com`, and the `keypears.json` points to
their own server:

```json
{
  "version": 1,
  "apiUrl": "https://kp.acme.com/api"
}
```

Full control over data, infrastructure, and policies. Like running your own
mail server.

## Address Format

A KeyPears address is `name@domain`:

- **name** — a numeric user ID (e.g. `1`, `42`, `1000`)
- **domain** — the domain that hosts the user's `keypears.json`

The address is the user's identity. It does not change even if the hosting
provider changes, because the domain stays the same and only the
`keypears.json` file is updated.

## Discovery: keypears.json

When a client needs to interact with a user on another domain, it fetches
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
| apiUrl   | string | Base URL for all API calls for this domain |

The `apiUrl` is the single entry point. All operations — key discovery,
message delivery, PoW challenges — go through this URL.

### Caching

Clients should cache `keypears.json` responses. The file changes rarely
(only when migrating hosting). A TTL of 1 hour is reasonable. On error,
fall back to the cached value.

## Key Discovery

To find a user's current public key:

```
GET {apiUrl}/getPublicKey?address=alice@acme.com
```

Response:

```json
{
  "publicKey": "02abc...def"
}
```

The server returns the user's **active** public key (the most recently
rotated secp256k1 key). This is used to compute the ECDH shared secret
for encryption.

## Message Delivery

### Same Domain

When sender and recipient are on the same server, messages are stored
directly. Each user has their own copy of the message in their own channel
view. No cross-domain communication needed.

### Cross Domain

When `alice@acme.com` sends a message to `bob@other.com`:

1. **Discover API** — Alice's client fetches
   `other.com/.well-known/keypears.json` to get Bob's `apiUrl`

2. **Get Bob's public key** — Alice's client calls
   `{bobApiUrl}/getPublicKey?address=bob@other.com`

3. **Encrypt** — Alice computes ECDH shared secret using her private key
   and Bob's public key, then encrypts the message with ACS2

4. **Get PoW challenge** (if new channel) — Alice's client calls
   `{bobApiUrl}/getPowChallenge` to get a signed work packet

5. **Mine PoW** — Alice's client solves the proof-of-work challenge

6. **Deliver** — Alice's client POSTs the encrypted message to
   `{bobApiUrl}/receiveMessage` with:
   - Sender address (`alice@acme.com`)
   - Encrypted content
   - Sender's public key
   - Recipient's public key
   - PoW solution (if new channel)

7. **Verify sender** — Bob's server verifies Alice's identity by fetching
   `acme.com/.well-known/keypears.json`, then calling
   `{aliceApiUrl}/verifyKey?address=alice@acme.com&publicKey=02abc...`
   to confirm Alice owns the claimed public key

8. **Store** — Bob's server stores the message in Bob's channel view

9. **Store locally** — Alice's client also stores the message in Alice's
   channel view on her own server

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

## Proof of Work for Cross-Domain

Opening a new channel to a user on any domain requires proof of work. This
prevents spam across the federation. The PoW challenge is issued by the
**recipient's server**, because the recipient's server is the one that
needs to be protected from spam.

The sender requests a challenge from the recipient's API, solves it
client-side, and includes the solution with the first message. Subsequent
messages to the same recipient do not require PoW.

PoW challenges are signed with HMAC by the issuing server. They are
stateless — no database entry is created until the message is actually
delivered with a valid solution. This prevents DoS attacks where an
attacker requests millions of challenges to fill the database.

## Identity Verification

When a server receives a cross-domain message claiming to be from
`alice@acme.com`, it must verify that Alice actually owns the public key
used to encrypt the message. The verification flow:

1. Fetch `acme.com/.well-known/keypears.json` → get Alice's `apiUrl`
2. Call `{aliceApiUrl}/verifyKey?address=alice@acme.com&publicKey=02abc...`
3. Alice's server confirms or denies ownership

This prevents impersonation — you can't claim to be `alice@acme.com`
without Alice's server confirming your public key.

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

**PoW-gated channels** — Spam protection is decentralized. Each server
sets its own PoW difficulty. A server under attack can raise its difficulty
independently.

**Verifiable identity** — Public keys are tied to addresses via the
domain's API. Cross-domain messages include sender verification to prevent
impersonation.

**Forward secrecy via key rotation** — Users can rotate keys at any time.
Old messages remain encrypted with old keys. New messages use the current
key. The protocol handles key transitions gracefully by storing both
sender and recipient public keys per message.
