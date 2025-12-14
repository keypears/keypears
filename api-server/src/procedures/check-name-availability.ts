import {
  CheckNameAvailabilityRequestSchema,
  CheckNameAvailabilityResponseSchema,
} from "../zod-schemas.js";
import { checkNameAvailability } from "../db/models/vault.js";
import { base } from "./base.js";

// Default difficulty for vault registration: 4,194,304 (2^22) = ~4 million hashes average
// This matches the default in get-pow-challenge.ts
export const REGISTRATION_DIFFICULTY = "4194304";

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
    async ({
      input,
    }): Promise<{ available: boolean; difficulty?: string }> => {
      const { name, domain } = input;

      // Check availability using model
      const available = await checkNameAvailability(name, domain);

      // Return difficulty only when name is available
      return {
        available,
        ...(available ? { difficulty: REGISTRATION_DIFFICULTY } : {}),
      };
    },
  );
