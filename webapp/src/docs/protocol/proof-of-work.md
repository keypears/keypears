
KeyPears uses client-side proof of work as a Sybil resistance mechanism,
building on Hashcash (Back, 2002) with adaptations for an interactive web
protocol.

## Why proof of work

Email has no cost to send, making spam economically rational. Hashcash proposed
the solution — impose a computational cost on each message — but couldn't
deploy it on SMTP because backwards compatibility prevents making it mandatory.

KeyPears makes proof of work a first-class protocol requirement. Every account
creation, login, and message requires proof of work. The cost is tunable by
operators and users.

## The pow5-64b algorithm

All proof of work uses the `pow5-64b` algorithm, designed for efficient GPU
execution. The algorithm operates on a 64-byte header and produces a 32-byte
hash. Mining consists of finding a nonce such that the hash of the modified
header is below a target value.

## Interactive challenges

Hashcash is non-interactive: the sender chooses a start value and the recipient
verifies the result. KeyPears uses interactive challenges:

1. The client requests a challenge from the server.
2. The server generates a 64-byte random header and a target based on the
   configured difficulty.
3. The server signs the challenge with HMAC-SHA-256 (using a server secret),
   including a 15-minute expiry timestamp.
4. The client mines the challenge by searching for a nonce that produces a hash
   below the target.
5. The client submits the solved header. The server verifies the MAC signature
   (stateless verification) and checks the hash meets the target.

Challenges are **stateless**: the server creates no database entry until a valid
solution is submitted. This prevents pre-computation attacks and avoids
server-side state for incomplete challenges.

## Configurable difficulty

The protocol does not dictate fixed difficulty levels. Difficulty is set
independently at two layers:

**Server operators** set the difficulty for account creation and login. An
operator experiencing spam can raise the account-creation difficulty at any time;
an operator under a brute-force attack can raise the login difficulty.

**Individual users** set the difficulty for incoming messages:

- **Channel difficulty** — required for a first message from a new sender
  (opening a channel). Higher values deter unsolicited contact.
- **Message difficulty** — required for subsequent messages in an existing
  channel. Lower values reduce friction for ongoing conversations.

Both have server-enforced minimums. Users configure their preferences via the
settings page.

## Authenticated challenges

Challenge requests for messaging are **authenticated**: the sender must sign the
request with their P-256 (NIST) private key. The recipient's server verifies the
signature by looking up the sender's public key via federation.

Both sender and recipient addresses are signed into the challenge payload by the
server's HMAC-SHA-256. This prevents:

- **Social-graph probing** — an unauthenticated party cannot request a
  challenge, so they cannot discover whether two users have a channel.
- **Cross-conversation reuse** — a challenge is bound to a specific
  sender/recipient pair.

## Replay prevention

Solutions are recorded in a spent-token table. Each entry includes the hash of
the solved header and an expiry timestamp. Duplicate submissions are rejected.
Expired entries are cleaned up lazily.

## PoW logging

All proof of work is logged against the user who performed it, tracking the
algorithm, difficulty, and cumulative difficulty. This data is displayed on the
user's profile.
