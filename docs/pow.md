# Proof-of-Work (PoW) System

KeyPears uses proof-of-work to prevent spam and abuse without compromising user
privacy. This document explains the technical implementation, security
properties, and future plans.

## Overview

Traditional spam prevention methods like CAPTCHAs and email verification:

- Degrade user experience
- Require third-party services
- Track users and compromise privacy
- Can be bypassed by determined attackers

KeyPears instead uses **proof-of-work**: users must perform computational work
to complete certain actions. This approach is:

- **Private**: No tracking, no third parties, no personal information required
- **Secure**: Cryptographically verified, cannot be bypassed
- **Fair**: Same rules for everyone, proportional to the value of the action
- **Decentralized**: Works across federated servers without coordination

### Credit

The Pow5 algorithm was invented by [EarthBucks](https://earthbucks.com) and is
used under open-source license. Pow5 is specifically designed to be
ASIC-resistant while remaining efficient on consumer GPUs.

## Algorithm

KeyPears currently uses **pow5-64b**, a single Pow5 algorithm variant. The
architecture supports adding additional algorithms in the future for increased
ASIC resistance.

### pow5-64b

- **Header size**: 64 bytes
- **Nonce region**: Bytes 0-31 (32-byte space)
- **GPU optimization**: Thread ID written to bytes 28-31
- **Hash function**: BLAKE3 with matrix multiplication operations

> **Note**: The PoW system uses BLAKE3, which is separate from the SHA-256 used
> in KeyPears' key derivation functions (see [kdf.md](./kdf.md)). BLAKE3 was
> chosen for PoW due to its speed and ASIC-resistance properties when combined
> with matrix multiplication. SHA-256 is used for password-to-key derivation
> where the slower performance is actually desirable for brute-force resistance.

The algorithm combines BLAKE3 hashing with matrix multiplication to create an
ASIC-resistant proof-of-work function:

1. **Hash the input** with BLAKE3 to get a 32-byte `matrix_A_row_1`
2. **Iterate 32 times**:
   - Hash the working column with BLAKE3 to get a new column
   - Multiply-and-add each byte of `matrix_A_row_1` against each byte of the new
     column (matmul-style operation)
3. **Expand** the 32 u32 result to 128 bytes (big-endian)
4. **Hash** the 128-byte result with BLAKE3 to get the final 32-byte output

The matmul step makes pow5 ASIC-resistant: matrix multiplication requires
significant memory bandwidth and is difficult to optimize beyond what GPUs
already provide.

### Future Algorithm Support

The system is designed to support multiple algorithms. Future additions could
provide:

1. **ASIC resistance**: Specialized hardware would need to support all variants
2. **Different compute profiles**: Varying memory and computation requirements
3. **Flexibility**: Can add new variants or adjust selection probability

## Difficulty System

### Base Difficulty

The base difficulty is **4,000,000** (~4 million), which requires approximately:

- **GPU (WebGPU)**: ~4 seconds
- **CPU (WASM)**: ~40 seconds

### Variable Difficulty

Shorter vault names are more valuable (like short domain names), so they require
exponentially more work to register:

```
difficulty = 4,000,000 × 2^(10 - name_length)
```

For names with 10 or more characters, the base difficulty applies.

### Difficulty Table

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

> **Note**: The difficulty table values are approximate. The base difficulty is
> exactly 4,000,000 (a round number for simplicity), not 2^22 (4,194,304).

This ensures that:

- Normal users can register typical names quickly
- Premium short names require significant investment
- Mass registration attacks are economically impractical

### Test Environment

In test environment (`NODE_ENV=test`), `difficultyForName()` uses
`TEST_BASE_DIFFICULTY` (1) instead of `BASE_REGISTRATION_DIFFICULTY`
(4,194,304). The 2x scaling per character still applies, but tests complete
instantly:

| Name Length | Test Difficulty | Avg Hashes |
| ----------- | --------------- | ---------- |
| 3 chars     | 128             | ~128       |
| 4 chars     | 64              | ~64        |
| 5 chars     | 32              | ~32        |
| 10+ chars   | 1               | ~1         |

This allows the test suite to exercise the full PoW flow (challenge creation,
mining, verification) without waiting for real mining times.

## Implementation

### WebGPU Mining (GPU)

The preferred mining implementation uses WebGPU for massive parallelism:

- **Workgroup size**: 256 threads
- **Grid size**: 128 workgroups
- **Hashes per iteration**: 32,768 (256 × 128)
- **Automatic detection**: Falls back to CPU if WebGPU unavailable

Each GPU `work()` call computes 32,768 hashes in parallel, making GPU mining
approximately 10x faster than CPU mining.

### WASM Mining (CPU)

The fallback implementation uses WebAssembly for compatibility:

- **Sequential execution**: 1 hash per iteration
- **UI responsiveness**: Yields every 10,000 iterations
- **Universal support**: Works in all modern browsers

### Client Implementation

The mining flow:

1. Check WebGPU availability via `navigator.gpu`
2. If available, use WGSL/GPU implementation
3. Otherwise, fall back to WASM/CPU implementation
4. Track real hash count (GPU iterations × 32,768, CPU iterations × 1)
5. Display progress to user with elapsed time

## Security Properties

### Challenge-Response Protocol

1. **Challenge creation**: Server generates random header and stores in database
2. **Mining**: Client finds nonce that produces hash below target
3. **Verification**: Server validates solution and marks challenge as used
4. **Single-use**: Each challenge can only be consumed once

### Atomic Challenge Consumption

A critical security property is preventing race conditions where multiple
requests attempt to use the same solved challenge. KeyPears uses atomic database
operations:

```sql
UPDATE pow_challenge
SET is_used = true, solved_header = ?, verified_at = NOW()
WHERE id = ? AND is_used = false
RETURNING id
```

The `WHERE is_used = false` clause ensures only one concurrent request can
successfully claim a challenge. This prevents TOCTOU (time-of-check to
time-of-use) attacks.

### Verification Steps

The server performs comprehensive validation:

1. **Challenge lookup**: Verify challenge exists
2. **Expiration check**: Challenge must be within 15-minute window
3. **Difficulty enforcement**: Challenge difficulty must meet minimum for action
4. **Header validation**: Solved header must match expected length
5. **Non-nonce verification**: All bytes except nonce region must match original
6. **Hash recomputation**: Server independently computes hash
7. **Target check**: Hash must be below difficulty target
8. **Atomic claim**: Challenge marked used in single atomic operation

### Challenge Expiration

Challenges expire after **15 minutes**. This extended window accommodates:

- Long mining times for short (high-difficulty) names
- Network latency and retries
- Users on slower devices

After expiration, challenges cannot be used even if solved.

### Minimum Difficulty Enforcement

The server enforces minimum difficulty based on the action:

- **Vault registration**: `difficultyForName(name)` based on name length
- **Future messaging**: Will have separate difficulty requirements

This prevents attacks where malicious actors request low-difficulty challenges
and attempt to use them for high-value actions.

## Current Integration: Vault Registration

### User Flow

1. **Name selection**: User enters desired vault name
2. **Availability check**: Server returns availability and required difficulty
3. **Difficulty display**: UI shows difficulty and estimated mining time
4. **Password entry**: User sets master password
5. **Challenge request**: Client requests PoW challenge with required difficulty
6. **Mining**: Client mines using GPU (preferred) or CPU (fallback)
7. **Progress display**: UI shows hash count and elapsed time
8. **Registration**: Client submits solved challenge with registration data
9. **Verification**: Server validates PoW and creates vault

### What Users See

**During name selection:**

```
Mining difficulty: 128M (~2 minutes)
Shorter names require more work to prevent squatting.
```

**During mining:**

```
Mining Name...
Mining (GPU)...
Difficulty: 128M
Using WebGPU
4,128,768 hashes (2.3s)
```

## Future: Diffie-Hellman Key Exchange

### Planned Use Case

KeyPears will use PoW to throttle cross-domain messaging:

- `alice@server1.com` sends a message to `bob@server2.com`
- Alice must complete PoW before her message is delivered
- This prevents spam flooding between users
- Same privacy benefits apply (no CAPTCHAs, no tracking)

### Design Considerations

- Lower difficulty than registration (messages should be quick to send)
- Per-recipient rate limiting possible
- Recipients can adjust required difficulty
- Servers can set minimum difficulty policies

## Progress Checklist

### Completed

- [x] Pow5 algorithm integration (pow5-64b)
- [x] WebGPU/WGSL GPU mining implementation
- [x] WASM/CPU fallback implementation
- [x] Variable difficulty based on vault name length
- [x] Server-side challenge creation and verification
- [x] Atomic challenge consumption (TOCTOU race condition fix)
- [x] Minimum difficulty enforcement per action
- [x] 15-minute challenge expiration window
- [x] Real hash count display in UI (accounting for GPU parallelism)
- [x] Cancel button during mining
- [x] Difficulty and time estimate display before mining

### Upcoming

- [ ] Diffie-Hellman key exchange between users across domains
- [ ] PoW-throttled cross-domain messaging
- [ ] Per-recipient difficulty settings
- [ ] Server-configurable minimum difficulty policies

## Technical Reference

### Key Files

| Component              | Location                                      |
| ---------------------- | --------------------------------------------- |
| Difficulty calculation | `lib/src/index.ts` (`difficultyForName`)      |
| Server constants       | `api-server/src/constants.ts`                 |
| Challenge model        | `api-server/src/db/models/pow-challenge.ts`   |
| Registration procedure | `api-server/src/procedures/register-vault.ts` |
| Client mining hook     | `tauri-ts/app/lib/use-pow-miner.ts`           |
| Registration UI        | `tauri-ts/app/routes/new-vault.3.tsx`         |

### Constants

| Constant                       | Value     | Location                            | Description                      |
| ------------------------------ | --------- | ----------------------------------- | -------------------------------- |
| `BASE_REGISTRATION_DIFFICULTY` | 4,000,000 | `lib/src/index.ts`                  | Base difficulty (~4M)            |
| `TEST_BASE_DIFFICULTY`         | 1         | `lib/src/index.ts`                  | Test environment base difficulty |
| `CHALLENGE_EXPIRATION_MS`      | 900,000   | `api-server/src/constants.ts`       | 15 minutes in milliseconds       |
| `GPU_WORKGROUP_SIZE`           | 256       | `tauri-ts/app/lib/use-pow-miner.ts` | Threads per GPU workgroup        |
| `GPU_GRID_SIZE`                | 128       | `tauri-ts/app/lib/use-pow-miner.ts` | Workgroups per GPU dispatch      |
| `HASHES_PER_GPU_ITERATION`     | 32,768    | `tauri-ts/app/lib/use-pow-miner.ts` | Total hashes per GPU work() call |

### Build Process

The pow5 algorithm is implemented in Rust and compiled to WASM for use in
TypeScript:

```bash
# Build Rust to WASM
cd pow5-rs && ./wasm-pack-bundler.zsh

# Sync WASM artifacts to TypeScript package
cd pow5-ts && pnpm run sync:from-rust

# Build TypeScript package
cd pow5-ts && pnpm run build:wasm
```

Testing:

```bash
# Rust tests
cd pow5-rs && cargo test

# TypeScript tests (runs in browser via Playwright)
cd pow5-ts && pnpm test
```
