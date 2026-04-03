import { FixedBuf } from "@webbuf/fixedbuf";

/**
 * Server-side derivation entropy management for engagement key generation.
 *
 * Derivation entropy is stored as environment variables using an incrementing index pattern:
 * - DERIVATION_ENTROPY_1, DERIVATION_ENTROPY_2, etc.
 *
 * The highest-numbered entropy is the "current" one for new derivations.
 * All entropy values are retained for re-derivation of historical engagement keys.
 *
 * Entropy is loaded automatically when this module is imported.
 */

interface DerivationKeyState {
  keys: Map<number, FixedBuf<32>>;
  currentIndex: number;
}

/**
 * Load and validate all derivation entropy from environment variables.
 * Called automatically at module load time.
 *
 * @throws Error if no entropy found, entropy has gaps, or entropy is invalid format
 */
function loadDerivationKeys(): DerivationKeyState {
  const keys = new Map<number, FixedBuf<32>>();

  // Load all DERIVATION_ENTROPY_N variables
  for (let i = 1; ; i++) {
    const keyHex = process.env[`DERIVATION_ENTROPY_${i}`];
    if (!keyHex) break;

    // Validate hex format (64 hex chars = 32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
      throw new Error(
        `DERIVATION_ENTROPY_${i} must be exactly 64 hex characters (32 bytes). ` +
          `Got ${keyHex.length} characters.`,
      );
    }

    try {
      const keyBuf = FixedBuf.fromHex(32, keyHex);
      keys.set(i, keyBuf);
    } catch (error) {
      throw new Error(
        `DERIVATION_ENTROPY_${i} is not valid hex: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Validate at least one entropy exists
  if (keys.size === 0) {
    throw new Error(
      "No derivation entropy found. Set DERIVATION_ENTROPY_1 environment variable.",
    );
  }

  // Validate no gaps (must have 1..N for some N >= 1)
  const indices = [...keys.keys()].sort((a, b) => a - b);
  for (let i = 0; i < indices.length; i++) {
    const expected = i + 1;
    const actual = indices[i];
    if (actual !== expected) {
      throw new Error(
        `Gap in derivation entropy: expected DERIVATION_ENTROPY_${expected}, ` +
          `but found DERIVATION_ENTROPY_${actual}. Entropy must be sequential starting from 1.`,
      );
    }
  }

  const currentIndex = Math.max(...keys.keys());

  // Warn if only one entropy (rotation may be overdue)
  if (keys.size === 1) {
    console.warn(
      "Only one derivation entropy configured. Consider adding a rotation.",
    );
  }

  console.log(
    `Loaded ${keys.size} derivation entropy value(s), current index: ${currentIndex}`,
  );

  return { keys, currentIndex };
}

// Load keys immediately at module load time
const state: DerivationKeyState = loadDerivationKeys();

/**
 * Get the current derivation key index (highest numbered key).
 * Use this index when storing new engagement keys.
 */
export function getCurrentDerivationKeyIndex(): number {
  return state.currentIndex;
}

/**
 * Get the current derivation key for new engagement key generation.
 */
export function getCurrentDerivationKey(): FixedBuf<32> {
  const key = state.keys.get(state.currentIndex);
  if (!key) {
    // This should never happen if initialization succeeded
    throw new Error(`Current derivation key ${state.currentIndex} not found.`);
  }
  return key;
}

/**
 * Get a specific derivation key by index.
 * Use this for re-deriving historical engagement keys.
 *
 * @param index - The derivation key index (from engagement key record)
 * @throws Error if index not found
 */
export function getDerivationKey(index: number): FixedBuf<32> {
  const key = state.keys.get(index);
  if (!key) {
    throw new Error(
      `Derivation key ${index} not found. ` +
        `Available keys: ${[...state.keys.keys()].join(", ")}`,
    );
  }
  return key;
}

/**
 * Get the total number of derivation keys loaded.
 */
export function getDerivationKeyCount(): number {
  return state.keys.size;
}
