import { FixedBuf } from "@webbuf/fixedbuf";

/**
 * Server-side derivation key management for engagement key generation.
 *
 * Derivation keys are stored as environment variables using an incrementing index pattern:
 * - DERIVATION_PRIVKEY_1, DERIVATION_PRIVKEY_2, etc.
 *
 * The highest-numbered key is the "current" key for new derivations.
 * All keys are retained for re-derivation of historical engagement keys.
 */

interface DerivationKeyState {
  keys: Map<number, FixedBuf<32>>;
  currentIndex: number;
}

let state: DerivationKeyState | null = null;

/**
 * Load and validate all derivation keys from environment variables.
 * Must be called once on server startup before any key operations.
 *
 * @throws Error if no keys found, keys have gaps, or keys are invalid format
 */
export function initDerivationKeys(): void {
  const keys = new Map<number, FixedBuf<32>>();

  // Load all DERIVATION_PRIVKEY_N variables
  for (let i = 1; ; i++) {
    const keyHex = process.env[`DERIVATION_PRIVKEY_${i}`];
    if (!keyHex) break;

    // Validate hex format (64 hex chars = 32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
      throw new Error(
        `DERIVATION_PRIVKEY_${i} must be exactly 64 hex characters (32 bytes). ` +
          `Got ${keyHex.length} characters.`,
      );
    }

    try {
      const keyBuf = FixedBuf.fromHex(32, keyHex);
      keys.set(i, keyBuf);
    } catch (error) {
      throw new Error(
        `DERIVATION_PRIVKEY_${i} is not valid hex: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Validate at least one key exists
  if (keys.size === 0) {
    throw new Error(
      "No derivation keys found. Set DERIVATION_PRIVKEY_1 environment variable.",
    );
  }

  // Validate no gaps (must have 1..N for some N >= 1)
  const indices = [...keys.keys()].sort((a, b) => a - b);
  for (let i = 0; i < indices.length; i++) {
    const expected = i + 1;
    const actual = indices[i];
    if (actual !== expected) {
      throw new Error(
        `Gap in derivation keys: expected DERIVATION_PRIVKEY_${expected}, ` +
          `but found DERIVATION_PRIVKEY_${actual}. Keys must be sequential starting from 1.`,
      );
    }
  }

  const currentIndex = Math.max(...keys.keys());

  // Warn if only one key (rotation may be overdue)
  if (keys.size === 1) {
    console.warn(
      "Only one derivation key configured. Consider adding a rotation key.",
    );
  }

  state = { keys, currentIndex };

  console.log(
    `Loaded ${keys.size} derivation key(s), current index: ${currentIndex}`,
  );
}

/**
 * Get the current derivation key index (highest numbered key).
 * Use this index when storing new engagement keys.
 *
 * @throws Error if initDerivationKeys() has not been called
 */
export function getCurrentDerivationKeyIndex(): number {
  if (!state) {
    throw new Error(
      "Derivation keys not initialized. Call initDerivationKeys() first.",
    );
  }
  return state.currentIndex;
}

/**
 * Get the current derivation key for new engagement key generation.
 *
 * @throws Error if initDerivationKeys() has not been called
 */
export function getCurrentDerivationKey(): FixedBuf<32> {
  if (!state) {
    throw new Error(
      "Derivation keys not initialized. Call initDerivationKeys() first.",
    );
  }
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
 * @throws Error if initDerivationKeys() has not been called or index not found
 */
export function getDerivationKey(index: number): FixedBuf<32> {
  if (!state) {
    throw new Error(
      "Derivation keys not initialized. Call initDerivationKeys() first.",
    );
  }
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
 *
 * @throws Error if initDerivationKeys() has not been called
 */
export function getDerivationKeyCount(): number {
  if (!state) {
    throw new Error(
      "Derivation keys not initialized. Call initDerivationKeys() first.",
    );
  }
  return state.keys.size;
}

/**
 * Check if derivation keys have been initialized.
 */
export function isDerivationKeysInitialized(): boolean {
  return state !== null;
}
