import { matmul_work_64b, elementary_iteration_64b, insert_nonce_64b, set_nonce_64b, } from "./rs-keypears_pow5-inline-base64/keypears_pow5.js";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";
/**
 * Compute the matmul work for a 64-byte header.
 * This is the ASIC-resistant computation (same algorithm as 217a).
 */
export function matmulWork(header) {
    return FixedBuf.fromBuf(32, WebBuf.fromUint8Array(matmul_work_64b(header.buf)));
}
/**
 * Compute the elementary iteration for a 64-byte header.
 * Returns the final PoW hash (double-hash of the matmul result).
 */
export function elementaryIteration(header) {
    return FixedBuf.fromBuf(32, WebBuf.fromUint8Array(elementary_iteration_64b(header.buf)));
}
/**
 * Insert a 4-byte nonce into bytes 28-31 of the header.
 * This is used for GPU iteration where the GPU increments the last 4 bytes.
 */
export function insertNonce(header, nonce) {
    const res = WebBuf.fromUint8Array(insert_nonce_64b(header.buf, nonce));
    return FixedBuf.fromBuf(64, res);
}
/**
 * Set the full 32-byte nonce (bytes 0-31) of the header.
 */
export function setNonce(header, nonce) {
    const res = WebBuf.fromUint8Array(set_nonce_64b(header.buf, nonce.buf));
    return FixedBuf.fromBuf(64, res);
}
