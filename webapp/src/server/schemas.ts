import { z } from "zod";
import { hexBytes, addressSchema } from "@keypears/client";

export { hexBytes, hexMaxBytes, addressSchema } from "@keypears/client";

export const PowSolutionSchema = z.object({
  solvedHeader: hexBytes(64),
  target: hexBytes(32),
  expiresAt: z.number(),
  signature: hexBytes(32),
  senderAddress: addressSchema.optional(),
  recipientAddress: addressSchema.optional(),
});

export const nameSchema = z
  .string()
  .min(1, "Name must be at least 1 character")
  .max(30, "Name must be at most 30 characters")
  .regex(/^[a-z]/, "Name must start with a lowercase letter")
  .regex(/^[a-z0-9]+$/, "Name must contain only lowercase letters and numbers");
