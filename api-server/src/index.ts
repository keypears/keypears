import { blake3Procedure } from "./procedures/blake3.js";
import { checkNameAvailabilityProcedure } from "./procedures/check-name-availability.js";
import { registerVaultProcedure } from "./procedures/register-vault.js";

/**
 * KeyPears Node API Router
 * TypeScript implementation of the KeyPears API
 */
export const router = {
  blake3: blake3Procedure,
  checkNameAvailability: checkNameAvailabilityProcedure,
  registerVault: registerVaultProcedure,
};

// Export the router type for client usage
export type Router = typeof router;

// Re-export schemas for convenience
export * from "./zod-schemas.js";

// Re-export client for convenience
export * from "./client.js";
