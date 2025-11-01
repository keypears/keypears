import { z } from "zod";

export const Blake3RequestSchema = z.object({
  data: z.string(),
});

export const Blake3ResponseSchema = z.object({
  hash: z.string().length(64),
});
