/**
 * Shared constants for the KeyPears API server
 */

// PoW difficulty for user registration: 4,194,304 (2^22) = ~4 million hashes average
// Takes a few seconds with WGSL/GPU, much longer with WASM/CPU
// Can be overridden via TEST_REGISTRATION_DIFFICULTY env var for fast test execution
const DEFAULT_REGISTRATION_DIFFICULTY = 4194304n;
export const REGISTRATION_DIFFICULTY: bigint = process.env.TEST_REGISTRATION_DIFFICULTY
  ? BigInt(process.env.TEST_REGISTRATION_DIFFICULTY)
  : DEFAULT_REGISTRATION_DIFFICULTY;

// Challenge expiration time in milliseconds (15 minutes)
// Longer expiration needed because short names (3-4 chars) can take 8+ minutes to mine
export const CHALLENGE_EXPIRATION_MS = 15 * 60 * 1000;

// Header sizes for each PoW algorithm
export const HEADER_SIZE_64B = 64;
export const HEADER_SIZE_217A = 217;

// Nonce regions for each algorithm (bytes that can be modified by the miner)
export const NONCE_START_64B = 0;
export const NONCE_END_64B = 32;
export const NONCE_START_217A = 117;
export const NONCE_END_217A = 149;
