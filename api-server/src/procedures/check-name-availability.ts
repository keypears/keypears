import {
  CheckNameAvailabilityRequestSchema,
  CheckNameAvailabilityResponseSchema,
} from "../zod-schemas.js";
import { checkNameAvailability } from "../db/models/vault.js";
import { base } from "./base.js";

/**
 * Check name availability procedure
 * Checks if a vault name is available for a specific domain
 */
export const checkNameAvailabilityProcedure = base
  .input(CheckNameAvailabilityRequestSchema)
  .output(CheckNameAvailabilityResponseSchema)
  .handler(
    async ({ input }): Promise<{ available: boolean }> => {
      const { name, domain } = input;

      // Check availability using model
      const available = await checkNameAvailability(name, domain);

      return {
        available,
      };
    },
  );
