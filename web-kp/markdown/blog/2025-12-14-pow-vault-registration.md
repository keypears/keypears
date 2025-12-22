+++
title = "Why and How KeyPears Uses Proof-of-Work for Vault Registration"
date = "2025-12-14T06:00:00-06:00"
author = "KeyPears Team"
+++

**Note:** KeyPears is a work-in-progress open-source password manager and
cryptocurrency wallet. The design decisions described here represent our
development approach and may evolve before our official release.

This week we shipped proof-of-work for vault registration. When you create a new
vault, your device now mines a cryptographic puzzle before the server accepts
your registration. This post explains why we chose PoW over traditional
anti-spam measures and how the system works.

## The Problem: Spam Prevention Without Surveillance

Every online service faces the same problem: how do you prevent abuse without
making legitimate users jump through hoops?

Traditional solutions all have tradeoffs:

**CAPTCHAs** require users to identify traffic lights and crosswalks, degrading
the experience. They also send your browsing behavior to Google or hCaptcha,
compromising privacy. And determined attackers can pay humans pennies to solve
them at scale.

**Email verification** requires users to have an email address and wait for a
confirmation link. It tracks users, creates friction, and doesn't work well for
privacy-conscious users who want to use temporary email addresses.

**Phone verification** is even more invasive—requiring a phone number ties your
identity to a physical device and excludes users without phones.

**Rate limiting by IP** blocks legitimate users behind shared networks (coffee
shops, universities, corporate NATs) while sophisticated attackers rotate
through proxy networks.

None of these solutions fit KeyPears. We're building a federated password
manager where users can run their own servers or choose from multiple providers.
We can't require Google reCAPTCHA on a self-hosted server. We can't demand phone
verification from privacy-conscious users. We need something that works
everywhere, respects privacy, and actually prevents abuse.

## The Solution: Proof-of-Work

Proof-of-work flips the model. Instead of proving you're human by identifying
buses or providing personal information, you prove you're willing to spend
computational resources. Your device performs work—real, measurable, verifiable
work—before the server accepts your request.

This approach has several properties we care about:

**Privacy-preserving.** No tracking, no third parties, no personal information.
The server only sees that you solved a cryptographic puzzle. It doesn't know who
you are, where you're from, or what browser you're using.

**Fair.** Everyone follows the same rules. There's no "I'm a real person, trust
me" appeal process. You either did the work or you didn't.

**Decentralized.** Works across federated servers without coordination. Each
server generates its own challenges and verifies its own proofs. No central
authority required.

**Economically effective.** Mass registration attacks become expensive.
Registering 1,000 vaults requires 1,000× the computational work. At some point,
the cost exceeds the value of the attack.

Bitcoin popularized this idea for a different purpose (consensus), but the
underlying principle applies broadly: computational work is a scarce resource
that can't be faked.

## The Algorithm: pow5-64b

KeyPears uses **pow5**, an ASIC-resistant proof-of-work algorithm originally
developed for [EarthBucks](https://earthbucks.com). We adapted it for our use
case while preserving the core algorithm.

### Why ASIC Resistance Matters

A naive PoW algorithm (just hash repeatedly until you find a low value) can be
accelerated dramatically by custom hardware. Bitcoin ASICs compute SHA-256
hashes millions of times faster than GPUs. If KeyPears used simple SHA-256 PoW,
attackers with ASICs could register vaults instantly while legitimate users on
laptops waited minutes.

pow5 resists this by combining BLAKE3 hashing with matrix multiplication:

1. **Hash the input** with BLAKE3 to get a 32-byte row vector
2. **Iterate 32 times**, each time:
   - Hash the working column with BLAKE3
   - Multiply-and-add each byte of the row against the new column (matmul-style)
3. **Expand** the 32 u32 result to 128 bytes
4. **Hash** the expanded result with BLAKE3 for the final output

The matrix multiplication step is the key. GPUs are already optimized for
matmul—it's the core operation in machine learning. Building an ASIC that
outperforms a GPU at matmul is extremely difficult and expensive. This means
legitimate users with consumer GPUs can mine efficiently, while attackers can't
gain a massive advantage with custom hardware.

### The pow5-64b Variant

KeyPears uses pow5-64b, which takes a 64-byte input:

- **Bytes 0-31**: Nonce region (the miner searches this space)
- **Bytes 32-63**: Challenge from the server (fixed)

The GPU iterates through nonce values, computing pow5 hashes until it finds one
below the target threshold. With 32 bytes of nonce space (2^256 possibilities),
there's always a solution—the question is how long it takes to find one.

## Variable Difficulty: Short Names Cost More

Not all vault registrations are equal. A vault named `alice` is more valuable
than one named `alice-johnson-2024`—just like `cars.com` is more valuable than
`alice-johnson-cars-for-sale-2024.com`.

We encode this into the difficulty formula:

```
difficulty = 4,194,304 × 2^(10 - name_length)
```

For names with 10 or more characters, the base difficulty (4,194,304, or 2^22)
applies. For shorter names, difficulty doubles with each character removed:

| Name Length | Difficulty | GPU Time | CPU Time |
| ----------- | ---------- | -------- | -------- |
| 3 chars     | 512M       | ~8 min   | ~85 min  |
| 4 chars     | 256M       | ~4 min   | ~43 min  |
| 5 chars     | 128M       | ~2 min   | ~21 min  |
| 6 chars     | 64M        | ~1 min   | ~11 min  |
| 7 chars     | 32M        | ~32 sec  | ~5 min   |
| 8 chars     | 16M        | ~16 sec  | ~3 min   |
| 9 chars     | 8M         | ~8 sec   | ~80 sec  |
| 10+ chars   | 4M         | ~4 sec   | ~40 sec  |

This creates natural economics:

- **Typical users** pick descriptive names (8+ characters) and wait a few
  seconds
- **Premium names** require significant investment, discouraging squatting
- **Mass registration** of short names becomes computationally prohibitive

The difficulty calculation lives in `@keypears/lib`:

```typescript
export const BASE_REGISTRATION_DIFFICULTY = 4194304n; // 2^22

export function difficultyForName(name: string): bigint {
  const length = name.length;

  // Names at or above 10 chars get base difficulty
  if (length >= 10) {
    return BASE_REGISTRATION_DIFFICULTY;
  }

  // Shorter names: double difficulty per character
  const exponent = 10 - length;
  return BASE_REGISTRATION_DIFFICULTY * (1n << BigInt(exponent));
}
```

## The Mining Experience

When you create a vault in KeyPears, here's what happens:

### 1. Name Selection

You enter your desired vault name. The UI immediately shows the required
difficulty:

```
Mining difficulty: 128M (~2 minutes)
Shorter names require more work to prevent squatting.
```

This sets expectations before you commit to the process.

### 2. Challenge Request

After you set your master password, the client requests a PoW challenge from the
server:

```typescript
const challenge = await client.api.getPowChallenge({
  difficulty: difficultyForName(vaultName).toString(),
});
```

The server generates a random 64-byte header, calculates the target threshold
from the difficulty, and stores the challenge in the database with a 15-minute
expiration.

### 3. Mining

The client mines the challenge using WebGPU (if available) or falls back to
WebAssembly:

**WebGPU (GPU mining)**:

- 256 threads per workgroup
- 128 workgroups per dispatch
- 32,768 hashes per iteration
- ~10x faster than CPU

**WebAssembly (CPU mining)**:

- Sequential execution
- 1 hash per iteration
- Yields to UI every 10,000 iterations
- Universal browser support

The UI shows progress:

```
Mining (GPU)...
Difficulty: 128M
Using WebGPU
4,128,768 hashes (2.3s)
```

Users can cancel at any time if they change their mind.

### 4. Verification and Registration

Once the miner finds a valid nonce, the client submits the registration request
with the solved challenge:

```typescript
await client.api.registerVault({
  vaultId,
  name: vaultName,
  domain,
  vaultPubKeyHash,
  vaultPubKey,
  loginKey,
  encryptedVaultKey,
  // PoW proof
  challengeId: powResult.challengeId,
  solvedHeader: powResult.solvedHeader,
  hash: powResult.hash,
});
```

The server verifies the proof before creating the vault.

## Security Properties

PoW systems have several potential attack vectors. Here's how we address them:

### Challenge Freshness

Challenges expire after 15 minutes. This extended window accommodates:

- Long mining times for short (high-difficulty) names
- Network latency and retries
- Users on slower devices

After expiration, challenges cannot be used even if solved. This prevents
attackers from pre-computing solutions.

### Atomic Challenge Consumption

A critical vulnerability in naive PoW implementations is the TOCTOU
(time-of-check to time-of-use) race condition. If two requests arrive
simultaneously with the same solved challenge, both might pass verification
before either marks the challenge as used.

We prevent this with an atomic database operation:

```sql
UPDATE pow_challenge
SET is_used = true, solved_header = ?, verified_at = NOW()
WHERE id = ? AND is_used = false
RETURNING id
```

The `WHERE is_used = false` clause ensures only one concurrent request can claim
a challenge. The database guarantees atomicity—if two requests race, exactly one
succeeds.

### Minimum Difficulty Enforcement

The server enforces minimum difficulty based on the action. For vault
registration, the challenge difficulty must meet or exceed `difficultyForName()`
for the requested name. This prevents attackers from requesting easy challenges
and using them for valuable short names.

### Full Verification

The server doesn't trust the client's claimed hash. It performs complete
verification:

1. Look up the challenge by ID
2. Check the challenge hasn't expired
3. Verify difficulty meets the minimum for this action
4. Validate the solved header length matches the algorithm
5. Verify non-nonce bytes match the original header
6. Recompute the hash independently
7. Verify the hash meets the difficulty target
8. Atomically claim the challenge

If any step fails, the registration is rejected.

## What Users See

We worked to make the mining experience transparent and non-frustrating:

**Before mining**: The difficulty and estimated time are shown when you select a
name. No surprises.

**During mining**: Real-time progress shows hash count and elapsed time. A
cancel button is always available.

**After mining**: Registration completes immediately once mining finishes. The
PoW is invisible at this point—you just see your new vault.

For typical names (8+ characters), mining takes about 4 seconds on a GPU or 40
seconds on a CPU. Most users won't even notice the delay.

## Future: Cross-Domain Messaging

Vault registration is just the first use of PoW in KeyPears. We're planning to
use it for cross-domain messaging as well.

When `alice@server1.com` wants to send a secret to `bob@server2.com`, she'll
need to complete a PoW challenge. This prevents:

- Spam flooding between users
- Harassment campaigns
- Automated message attacks

The difficulty for messaging will be lower than registration (messages should be
quick to send), and established relationships can skip PoW entirely. But for
first contact with unknown users, computational work provides a privacy-
preserving throttle.

## Conclusion

Proof-of-work gives us something unique: spam prevention that respects privacy.

No CAPTCHAs asking you to identify motorcycles. No email verification tracking
your address. No phone numbers tying your identity to a SIM card. Just
computational work—anonymous, verifiable, and fair.

The pow5 algorithm ensures this work can't be shortcut with specialized
hardware. Variable difficulty makes short names valuable without blocking normal
users. Atomic challenge consumption prevents race condition attacks. And the
15-minute expiration window stops pre-computation.

For users, the experience is simple: pick a name, set a password, wait a few
seconds, and your vault is ready. The cryptographic machinery is invisible. But
behind the scenes, that brief wait represents real computational investment—
investment that would be prohibitively expensive to replicate at scale for
attackers.

This is what we mean by "the convenience of cloud sync with the security of
self-custody." Even the anti-spam mechanism preserves your privacy.

_Next up: the Diffie-Hellman key exchange protocol for cross-user secret
sharing. Stay tuned!_
