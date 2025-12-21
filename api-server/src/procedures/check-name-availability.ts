import { difficultyForName } from "@keypears/lib";
import {
  CheckNameAvailabilityRequestSchema,
  CheckNameAvailabilityResponseSchema,
} from "../zod-schemas.js";
import { checkNameAvailability } from "../db/models/vault.js";
import { base } from "./base.js";

/**
 * Check name availability procedure
 * Checks if a vault name is available for a specific domain
 *
 * Returns difficulty requirement when name is available so client can
 * start mining a PoW challenge immediately.
 */
export const checkNameAvailabilityProcedure = base
  .input(CheckNameAvailabilityRequestSchema)
  .output(CheckNameAvailabilityResponseSchema)
  .handler(
    async ({ input }): Promise<{ available: boolean; difficulty?: number }> => {
      const { name, domain } = input;

      // Check availability using model
      const available = await checkNameAvailability(name, domain);

      // Return difficulty only when name is available
      // Difficulty varies by name length - shorter names require more work
      return {
        available,
        ...(available ? { difficulty: Number(difficultyForName(name)) } : {}),
      };
    },
  );
