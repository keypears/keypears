/**
 * Shared constants for the KeyPears API server
 */

// Challenge expiration time in milliseconds (15 minutes)
// Longer expiration needed because short names (3-4 chars) can take 8+ minutes to mine
export const CHALLENGE_EXPIRATION_MS = 15 * 60 * 1000;

// Header size for pow5-64b algorithm
export const HEADER_SIZE_64B = 64;

// Nonce region for pow5-64b (bytes that can be modified by the miner)
export const NONCE_START_64B = 0;
export const NONCE_END_64B = 32;

// Default messaging difficulty (~4 million hashes)
export const DEFAULT_MESSAGING_DIFFICULTY = 4_000_000;

// Minimum difficulty users can set (prevents trivially low values)
export const MIN_USER_DIFFICULTY = 256;

// Maximum size of encrypted data blobs in bytes (10KB)
// This applies to messages, secret updates, and other encrypted content
export const MAX_ENCRYPTED_DATA_BYTES = 10_000;

// Difficulty presets for UI
export const DIFFICULTY_PRESETS = {
  default: null, // Uses system default
  easy: 4_000_000, // 4M hashes
  medium: 40_000_000, // 40M hashes
  hard: 400_000_000, // 400M hashes
} as const;
