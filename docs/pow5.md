# pow5: Proof-of-Work for KeyPears

## Overview

pow5 is an ASIC-resistant proof-of-work algorithm that runs efficiently in web
browsers using WebGPU. KeyPears uses pow5 as an anti-spam mechanism for new user
registrations and messages from unknown users.

## Origin

pow5 was originally developed for
[EarthBucks](https://github.com/earthbucks/earthbucks), a cryptocurrency
project. The algorithm was designed to be:

- **ASIC-resistant**: Uses matrix multiplication (matmul) operations that are
  difficult to optimize in custom hardware
- **GPU-friendly**: Leverages parallel computation via WebGPU/WGSL
- **Browser-compatible**: Runs entirely in the browser without server-side
  computation

We copied pow5 from the earthbucks repository and adapted it for KeyPears while
preserving the core algorithm.

## Algorithm

pow5 combines BLAKE3 hashing with matrix multiplication to create an
ASIC-resistant proof-of-work function:

1. **Hash the input** with BLAKE3 to get a 32-byte `matrix_A_row_1`
2. **Iterate 32 times**:
   - Hash the working column to get a new column
   - Multiply-and-add each byte of `matrix_A_row_1` against each byte of the new
     column (matmul-style operation)
3. **Expand** the 32 u32 result to 128 bytes (big-endian)
4. **Hash** the 128-byte result with BLAKE3 to get the final 32-byte output

The matmul step is what makes pow5 ASIC-resistant: matrix multiplication
requires significant memory bandwidth and is difficult to optimize beyond what
GPUs already provide.

## Variants

### pow5-217a (EarthBucks)

The original EarthBucks version uses a 217-byte header format:

- **Input size**: 217 bytes (earthbucks block header)
- **Nonce position**: bytes 117-121 (4-byte nonce)
- **Work_par slot**: bytes 185-217 (32 bytes for matmul result)
- **Algorithm**: Computes matmul result ("work_par"), inserts it into the
  header, then double-hashes

This variant is preserved in the codebase for reference and comparison.

**Files**:

- `pow5-ts/src/pow5-217a.wgsl` - WebGPU shader
- `pow5-ts/src/pow5-217a-wgsl.ts` - TypeScript WGSL wrapper
- `pow5-ts/src/pow5-217a-wasm.ts` - TypeScript WASM wrapper
- `pow5-rs/src/lib.rs` - Rust functions with `_217a` suffix

### pow5-64b (KeyPears)

The KeyPears version uses a simplified 64-byte format:

- **Input size**: 64 bytes (32-byte nonce + 32-byte challenge)
- **Nonce position**: bytes 0-31 (32-byte nonce, GPU iterates bytes 28-31)
- **No work_par slot**: The matmul result is directly double-hashed
- **Algorithm**: Computes matmul result, then double-hashes it (no insertion
  step)

The 64-byte format is sufficient for KeyPears because we don't need the full
earthbucks header structure. The 32-byte nonce provides 2^256 possible values,
far more than needed.

**Files**:

- `pow5-ts/src/pow5-64b.wgsl` - WebGPU shader
- `pow5-ts/src/pow5-64b-wgsl.ts` - TypeScript WGSL wrapper
- `pow5-ts/src/pow5-64b-wasm.ts` - TypeScript WASM wrapper
- `pow5-rs/src/lib.rs` - Rust functions with `_64b` suffix

## Key Differences Between Variants

| Aspect             | pow5-217a                           | pow5-64b                     |
| ------------------ | ----------------------------------- | ---------------------------- |
| Input size         | 217 bytes                           | 64 bytes                     |
| Nonce size         | 4 bytes                             | 32 bytes (GPU uses last 4)   |
| Nonce position     | bytes 117-121                       | bytes 0-31                   |
| Work_par insertion | Yes (bytes 185-217)                 | No                           |
| Final hash         | Double-hash of header with work_par | Double-hash of matmul result |
| Core matmul        | Identical                           | Identical                    |

The core ASIC-resistant matmul computation is **identical** between variants.
The only differences are input size and whether the matmul result is inserted
back into the header before final hashing.

## Implementation Architecture

### WebGPU (WGSL) - Client-side mining

The WGSL shaders run on the GPU for fast parallel nonce iteration:

```
Client GPU:
  input (64 bytes) → matmul computation → final hash → compare to target
  ↑                                                    ↓
  increment nonce ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←← if hash > target
```

### WASM (Rust) - Server-side verification

The Rust/WASM implementation provides:

- Server-side verification of submitted proofs
- Fallback for clients without WebGPU support
- Reference implementation for testing

## Use Cases in KeyPears

### 1. New User Registration

When a new user creates an account, the server requires proof-of-work to prevent
mass account creation (spam/sybil attacks):

```
1. Client requests to register
2. Server generates random 32-byte challenge + difficulty target
3. Client computes pow5-64b:
   - nonce (32 bytes) + challenge (32 bytes) = 64-byte input
   - Iterate nonces until hash < target
4. Client submits: nonce + challenge + resulting hash
5. Server verifies:
   - Challenge matches what was issued
   - pow5-64b(nonce || challenge) produces the submitted hash
   - Hash is below the difficulty target
6. If valid, account is created
```

**Difficulty adjustment**: The server adjusts difficulty based on:

- Current registration rate
- Time of day
- IP reputation
- Other anti-spam signals

### 2. Messages from Unknown Users

When a user receives a message from someone not in their contacts (unknown
sender), the sender must include proof-of-work:

```
1. Sender wants to message recipient
2. Sender's server requests challenge from recipient's server
3. Recipient's server returns: challenge + difficulty target
4. Sender computes pow5-64b proof
5. Message is sent with proof attached
6. Recipient's server verifies proof before delivering message
```

This prevents:

- Mass spam messaging
- Harassment campaigns
- Automated message flooding

**Difficulty considerations**:

- First message to a user: Higher difficulty
- Subsequent messages: Lower or no difficulty once relationship established
- Messages to contacts: No proof-of-work required

### 3. Password/Secret Sharing

When sharing a password or secret with a new recipient:

```
1. Sender initiates share with recipient's email
2. If recipient is unknown, proof-of-work is required
3. Sender computes proof
4. Share request is sent with proof
5. Recipient's server verifies before notifying recipient
```

## Difficulty and Target

The difficulty is expressed as a 256-bit target value. A proof is valid if:

```
hash(nonce || challenge) < target
```

Lower target = higher difficulty = more work required.

**Utility functions needed**:

- `targetFromDifficulty(difficulty: number)` - Convert human-readable difficulty
  to 256-bit target
- `difficultyFromTarget(target: FixedBuf<32>)` - Convert target back to
  difficulty number

## Build Process

### Rust to WASM

1. Edit Rust code in `pow5-rs/src/lib.rs`
2. Run `./wasm-pack-bundler.zsh` in `pow5-rs/`
3. Run `pnpm run sync:from-rust` in `pow5-ts/`
4. Run `pnpm run build:wasm` in `pow5-ts/`

### Testing

```bash
# Rust tests
cd pow5-rs && cargo test

# TypeScript tests (runs in browser via Playwright)
cd pow5-ts && pnpm test
```

## Security Considerations

1. **Challenge freshness**: Challenges should expire after a short time to
   prevent pre-computation attacks

2. **Challenge uniqueness**: Each challenge should be unique and tied to the
   specific request (registration, message, etc.)

3. **Difficulty calibration**: Difficulty should be high enough to deter spam
   but low enough that legitimate users complete proofs in reasonable time
   (target: 1-10 seconds on average hardware)

4. **Fallback for no GPU**: Clients without WebGPU can use WASM, though it will
   be slower. Consider longer timeouts for these clients.

## Future Considerations

- **Difficulty adjustment algorithm**: Implement dynamic difficulty based on
  network conditions
- **Proof caching**: Allow clients to pre-compute proofs for smoother UX
- **Mobile optimization**: Test and optimize for mobile GPU performance
- **Progressive proof-of-work**: Start with low difficulty and increase if
  behavior seems suspicious
