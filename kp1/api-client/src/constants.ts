/**
 * Client-side constants for the KeyPears API
 */

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
