import { eq, and } from "drizzle-orm";
import { os } from "@orpc/server";
import {
  CheckNameAvailabilityRequestSchema,
  CheckNameAvailabilityResponseSchema,
} from "../zod-schemas.js";
import { db } from "../db/index.js";
import { TableVault } from "../db/schema.js";

/**
 * Check name availability procedure
 * Checks if a vault name is available for a specific domain
 */
export const checkNameAvailabilityProcedure = os
  .input(CheckNameAvailabilityRequestSchema)
  .output(CheckNameAvailabilityResponseSchema)
  .handler(
    async ({ input }): Promise<{ available: boolean }> => {
      const { name, domain } = input;

      // Query database for existing vault with same name + domain
      const existing = await db
        .select()
        .from(TableVault)
        .where(and(eq(TableVault.name, name), eq(TableVault.domain, domain)))
        .limit(1);

      // Available if no existing vault found
      return {
        available: existing.length === 0,
      };
    },
  );
