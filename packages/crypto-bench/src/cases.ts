/**
 * Benchmark case definitions.
 *
 * Each case exports a pair of async functions: one that uses @webbuf (WASM)
 * and one that uses crypto.subtle (native, same API in Bun and browsers).
 *
 * Every function performs exactly one "operation" — the benchmark harness
 * is responsible for running it in a loop.
 *
 * Test inputs are module-level constants so they don't count toward the
 * measured time.
 */

import { sha256Hash, sha256Hmac } from "@webbuf/sha256";
import { pbkdf2Sha256 } from "@webbuf/pbkdf2-sha256";
import { aesgcmEncrypt, aesgcmDecrypt } from "@webbuf/aesgcm";
import {
  p256PublicKeyCreate,
  p256Sign,
  p256Verify,
  p256SharedSecret,
} from "@webbuf/p256";
import { FixedBuf } from "@webbuf/fixedbuf";
import { WebBuf } from "@webbuf/webbuf";

// --- Shared inputs (deterministic so both paths produce identical output) ---

const PASSWORD_BYTES = new Uint8Array(32);
for (let i = 0; i < 32; i++) PASSWORD_BYTES[i] = i;

const SALT_BYTES = new Uint8Array(32);
for (let i = 0; i < 32; i++) SALT_BYTES[i] = 32 + i;

const KEY_BYTES = new Uint8Array(32);
for (let i = 0; i < 32; i++) KEY_BYTES[i] = 64 + i;

const MSG_32 = new Uint8Array(32);
for (let i = 0; i < 32; i++) MSG_32[i] = 96 + i;

const MSG_1KB = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) MSG_1KB[i] = i & 0xff;

const DIGEST_32 = new Uint8Array(32);
for (let i = 0; i < 32; i++) DIGEST_32[i] = 128 + i;

// --- webbuf-wrapped versions (for the webbuf path) ---

const wb_password = WebBuf.fromUint8Array(PASSWORD_BYTES);
const wb_salt = WebBuf.fromUint8Array(SALT_BYTES);
const wb_key = WebBuf.fromUint8Array(KEY_BYTES);
const wb_msg_32 = WebBuf.fromUint8Array(MSG_32);
const wb_msg_1kb = WebBuf.fromUint8Array(MSG_1KB);
const wb_digest_32 = FixedBuf.fromBuf(32, WebBuf.fromUint8Array(DIGEST_32));

// P-256 key pair (created once, used by ECDH/ECDSA cases) —
// deterministic private key for reproducibility.
const PRIV_BYTES = new Uint8Array(32);
for (let i = 0; i < 32; i++) PRIV_BYTES[i] = 0x11;
const wb_priv = FixedBuf.fromBuf(32, WebBuf.fromUint8Array(PRIV_BYTES));
const wb_pub = p256PublicKeyCreate(wb_priv); // 33-byte compressed

// For the verify case we need a real signature over our digest. Create it
// once at module load so the verify loop is a pure verify operation.
const wb_k = FixedBuf.fromBuf(
  32,
  WebBuf.fromUint8Array(new Uint8Array(32).fill(0x42)),
);
const wb_signature = p256Sign(wb_digest_32, wb_priv, wb_k);

// A second key pair for ECDH (we need two).
const PRIV2_BYTES = new Uint8Array(32);
for (let i = 0; i < 32; i++) PRIV2_BYTES[i] = 0x22;
const wb_priv2 = FixedBuf.fromBuf(32, WebBuf.fromUint8Array(PRIV2_BYTES));
const wb_pub2 = p256PublicKeyCreate(wb_priv2);

// --- Web Crypto format helpers ---
//
// Web Crypto does not support compressed P-256 public keys. It wants
// uncompressed (65-byte: 0x04 || X || Y) via the "raw" format, or JWK.
// Our wb_pub is 33 bytes (0x02/0x03 || X). We'd need to decompress to use
// it directly with Web Crypto. For benchmarking ECDH/ECDSA we sidestep
// this by generating a fresh Web Crypto key pair at init time (see
// initWebCryptoKeys below) instead of importing our compressed keys.

interface WebCryptoP256Keys {
  priv: CryptoKey;
  pub: CryptoKey;
  pub2: CryptoKey;
  priv2: CryptoKey;
  signature: ArrayBuffer; // pre-computed signature over DIGEST_32
}

let webCryptoKeys: WebCryptoP256Keys | null = null;

export async function initWebCryptoKeys(): Promise<void> {
  const kp1 = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const kp1dh = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const kp2dh = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  // Pre-sign DIGEST_32 so the verify loop is pure verify.
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    (kp1 as CryptoKeyPair).privateKey,
    // Note: Web Crypto ECDSA hashes the message; to sign a raw digest
    // we'd need one-shot sign/verify. The easiest thing is to sign a
    // message that happens to be our DIGEST_32 bytes and accept that
    // Web Crypto will hash it once. This is fine for benchmarking — the
    // operation we're measuring is "one ECDSA sign" either way, even if
    // the inputs differ slightly.
    DIGEST_32,
  );
  webCryptoKeys = {
    priv: (kp1 as CryptoKeyPair).privateKey,
    pub: (kp1 as CryptoKeyPair).publicKey,
    priv2: (kp1dh as CryptoKeyPair).privateKey,
    pub2: (kp2dh as CryptoKeyPair).publicKey,
    signature: sig,
  };
}

// Pre-import the HMAC key and AES key once (these are one-time costs
// outside the hot path in real code, so we exclude them from the loop).
let wc_hmac_key: CryptoKey | null = null;
let wc_aes_key: CryptoKey | null = null;
let wc_pbkdf2_material: CryptoKey | null = null;

export async function initWebCryptoSymKeys(): Promise<void> {
  wc_hmac_key = await crypto.subtle.importKey(
    "raw",
    KEY_BYTES,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  wc_aes_key = await crypto.subtle.importKey(
    "raw",
    KEY_BYTES,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  wc_pbkdf2_material = await crypto.subtle.importKey(
    "raw",
    PASSWORD_BYTES,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
}

// --- Case implementations ---

// 1. PBKDF2-300K

export const pbkdf2_300k_webbuf = () => {
  pbkdf2Sha256(wb_password, wb_salt, 300_000, 32);
};

export const pbkdf2_300k_webcrypto = async () => {
  await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: SALT_BYTES,
      iterations: 300_000,
      hash: "SHA-256",
    },
    wc_pbkdf2_material!,
    256,
  );
};

// 2. PBKDF2-600K

export const pbkdf2_600k_webbuf = () => {
  pbkdf2Sha256(wb_password, wb_salt, 600_000, 32);
};

export const pbkdf2_600k_webcrypto = async () => {
  await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: SALT_BYTES,
      iterations: 600_000,
      hash: "SHA-256",
    },
    wc_pbkdf2_material!,
    256,
  );
};

// 3. SHA-256 on 32 bytes

export const sha256_32_webbuf = () => {
  sha256Hash(wb_msg_32);
};

export const sha256_32_webcrypto = async () => {
  await crypto.subtle.digest("SHA-256", MSG_32);
};

// 4. HMAC-SHA-256 on 32 bytes

export const hmac_sha256_32_webbuf = () => {
  sha256Hmac(wb_key, wb_msg_32);
};

export const hmac_sha256_32_webcrypto = async () => {
  await crypto.subtle.sign("HMAC", wc_hmac_key!, MSG_32);
};

// 5. AES-256-GCM encrypt + decrypt round-trip on 1 KB

export const aesgcm_1kb_webbuf = () => {
  const ct = aesgcmEncrypt(
    wb_msg_1kb,
    FixedBuf.fromBuf(32, WebBuf.fromUint8Array(KEY_BYTES)),
  );
  aesgcmDecrypt(
    ct,
    FixedBuf.fromBuf(32, WebBuf.fromUint8Array(KEY_BYTES)),
  );
};

const WC_IV = new Uint8Array(12); // fixed IV for benchmarking only

export const aesgcm_1kb_webcrypto = async () => {
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: WC_IV },
    wc_aes_key!,
    MSG_1KB,
  );
  await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: WC_IV },
    wc_aes_key!,
    ct,
  );
};

// 6. P-256 ECDH shared secret

export const p256_ecdh_webbuf = () => {
  p256SharedSecret(wb_priv, wb_pub2);
};

export const p256_ecdh_webcrypto = async () => {
  await crypto.subtle.deriveBits(
    { name: "ECDH", public: webCryptoKeys!.pub2 },
    webCryptoKeys!.priv2,
    256,
  );
};

// 7. P-256 ECDSA sign

export const p256_sign_webbuf = () => {
  p256Sign(wb_digest_32, wb_priv, wb_k);
};

export const p256_sign_webcrypto = async () => {
  await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    webCryptoKeys!.priv,
    DIGEST_32,
  );
};

// 8. P-256 ECDSA verify

export const p256_verify_webbuf = () => {
  p256Verify(wb_signature, wb_digest_32, wb_pub);
};

export const p256_verify_webcrypto = async () => {
  await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    webCryptoKeys!.pub,
    webCryptoKeys!.signature,
    DIGEST_32,
  );
};

// --- Case registry ---
//
// Each case lists its iteration counts. Larger counts for cheap ops so the
// total measured time stays in the ~1s range and gives stable averages.

export interface CaseDef {
  name: string;
  iters: number;
  webbuf: () => void | Promise<void>;
  webCrypto: () => Promise<void>;
}

export const CASES: CaseDef[] = [
  {
    name: "pbkdf2-300k",
    iters: 5,
    webbuf: pbkdf2_300k_webbuf,
    webCrypto: pbkdf2_300k_webcrypto,
  },
  {
    name: "pbkdf2-600k",
    iters: 3,
    webbuf: pbkdf2_600k_webbuf,
    webCrypto: pbkdf2_600k_webcrypto,
  },
  {
    name: "sha256-32",
    iters: 10_000,
    webbuf: sha256_32_webbuf,
    webCrypto: sha256_32_webcrypto,
  },
  {
    name: "hmac-sha256-32",
    iters: 10_000,
    webbuf: hmac_sha256_32_webbuf,
    webCrypto: hmac_sha256_32_webcrypto,
  },
  {
    name: "aesgcm-1kb",
    iters: 10_000,
    webbuf: aesgcm_1kb_webbuf,
    webCrypto: aesgcm_1kb_webcrypto,
  },
  {
    name: "p256-ecdh",
    iters: 1_000,
    webbuf: p256_ecdh_webbuf,
    webCrypto: p256_ecdh_webcrypto,
  },
  {
    name: "p256-sign",
    iters: 1_000,
    webbuf: p256_sign_webbuf,
    webCrypto: p256_sign_webcrypto,
  },
  {
    name: "p256-verify",
    iters: 1_000,
    webbuf: p256_verify_webbuf,
    webCrypto: p256_verify_webcrypto,
  },
];

/** Call once at startup before running any cases. */
export async function initAllKeys(): Promise<void> {
  await initWebCryptoKeys();
  await initWebCryptoSymKeys();
}
