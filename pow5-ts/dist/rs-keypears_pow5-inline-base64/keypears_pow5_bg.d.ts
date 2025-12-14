export function __wbg_set_wasm(val: any): void;
/**
 * @param {Uint8Array} input
 * @returns {Uint8Array}
 */
export function blake3_reference_hash(input: Uint8Array): Uint8Array;
/**
 * Compute work_par for 217-byte input (earthbucks format).
 * This is the ASIC-resistant matmul computation.
 * @param {Uint8Array} header
 * @returns {Uint8Array}
 */
export function get_work_par_217a(header: Uint8Array): Uint8Array;
/**
 * Elementary iteration for 217-byte input (earthbucks format).
 * Computes work_par, inserts it into the header, then double-hashes.
 * @param {Uint8Array} header
 * @returns {Uint8Array}
 */
export function elementary_iteration_217a(header: Uint8Array): Uint8Array;
/**
 * Insert 4-byte nonce into 217-byte header at bytes 117-121.
 * @param {Uint8Array} header
 * @param {number} nonce
 * @returns {Uint8Array}
 */
export function insert_nonce_217a(
  header: Uint8Array,
  nonce: number,
): Uint8Array;
/**
 * Matmul work computation for 64-byte input.
 * Same ASIC-resistant algorithm as 217a, just with different input size.
 * @param {Uint8Array} header
 * @returns {Uint8Array}
 */
export function matmul_work_64b(header: Uint8Array): Uint8Array;
/**
 * Elementary iteration for 64-byte input.
 * Unlike 217a, we don't insert work_par into the header.
 * We simply double-hash the matmul result to produce the final PoW hash.
 * @param {Uint8Array} header
 * @returns {Uint8Array}
 */
export function elementary_iteration_64b(header: Uint8Array): Uint8Array;
/**
 * Insert nonce into the last 4 bytes of the 32-byte nonce field (bytes 28-31).
 * This matches the WGSL implementation where the GPU iterates the last 4 bytes.
 * @param {Uint8Array} header
 * @param {number} nonce
 * @returns {Uint8Array}
 */
export function insert_nonce_64b(header: Uint8Array, nonce: number): Uint8Array;
/**
 * Set the full 32-byte nonce (bytes 0-31).
 * @param {Uint8Array} header
 * @param {Uint8Array} nonce
 * @returns {Uint8Array}
 */
export function set_nonce_64b(
  header: Uint8Array,
  nonce: Uint8Array,
): Uint8Array;
export function __wbindgen_cast_2241b6af4c4b2941(arg0: any, arg1: any): string;
export function __wbindgen_init_externref_table(): void;
