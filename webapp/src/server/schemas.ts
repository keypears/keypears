import { z } from "zod";

export const PowSolutionSchema = z.object({
  solvedHeader: z.string(),
  target: z.string(),
  expiresAt: z.number(),
  signature: z.string(),
  senderAddress: z.string().optional(),
  recipientAddress: z.string().optional(),
});

export const nameSchema = z
  .string()
  .min(1, "Name must be at least 1 character")
  .max(30, "Name must be at most 30 characters")
  .regex(/^[a-z]/, "Name must start with a lowercase letter")
  .regex(/^[a-z0-9]+$/, "Name must contain only lowercase letters and numbers");
