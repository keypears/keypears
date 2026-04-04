import { z } from "zod";

export const PowSolutionSchema = z.object({
  solvedHeader: z.string(),
  target: z.string(),
  expiresAt: z.number(),
  signature: z.string(),
});
