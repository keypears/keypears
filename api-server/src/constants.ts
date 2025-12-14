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
