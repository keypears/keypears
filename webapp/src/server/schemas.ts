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

export const PowSolutionSchema = z.object({
  solvedHeader: hexBytes(32),
  target: hexBytes(32),
  expiresAt: z.number(),
  signature: z.string(),
  senderAddress: addressSchema.optional(),
  recipientAddress: addressSchema.optional(),
});

export const nameSchema = z
  .string()
  .min(1, "Name must be at least 1 character")
  .max(30, "Name must be at most 30 characters")
  .regex(/^[a-z]/, "Name must start with a lowercase letter")
  .regex(/^[a-z0-9]+$/, "Name must contain only lowercase letters and numbers");
