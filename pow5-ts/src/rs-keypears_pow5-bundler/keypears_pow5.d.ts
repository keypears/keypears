/* tslint:disable */
/* eslint-disable */
export function blake3_reference_hash(input: Uint8Array): Uint8Array;
export function get_work_par(header: Uint8Array): Uint8Array;
export function elementary_iteration(header: Uint8Array): Uint8Array;
export function insert_nonce(header: Uint8Array, nonce: number): Uint8Array;
/**
 * Matmul work computation for 64-byte input.
 * Same ASIC-resistant algorithm as 217a, just with different input size.
 */
export function matmul_work_64b(header: Uint8Array): Uint8Array;
/**
 * Elementary iteration for 64-byte input.
 * Unlike 217a, we don't insert work_par into the header.
 * We simply double-hash the matmul result to produce the final PoW hash.
 */
export function elementary_iteration_64b(header: Uint8Array): Uint8Array;
/**
 * Insert nonce into the last 4 bytes of the 32-byte nonce field (bytes 28-31).
 * This matches the WGSL implementation where the GPU iterates the last 4 bytes.
 */
export function insert_nonce_64b(header: Uint8Array, nonce: number): Uint8Array;
/**
 * Set the full 32-byte nonce (bytes 0-31).
 */
export function set_nonce_64b(header: Uint8Array, nonce: Uint8Array): Uint8Array;
