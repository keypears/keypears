import { z } from "zod";

const HEX_RE = /^[0-9a-f]*$/i;

/** Hex-encoded byte string of exactly N bytes (2*N hex chars). */
export const hexBytes = (n: number) => z.string().regex(HEX_RE).length(n * 2);

/** Hex-encoded byte string of at most N bytes. */
export const hexMaxBytes = (n: number) => z.string().regex(HEX_RE).max(n * 2);

/** KeyPears address: name@domain */
export const addressSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*@[a-z0-9.-]+$/);
