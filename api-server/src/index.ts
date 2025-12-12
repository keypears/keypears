import { checkNameAvailabilityProcedure } from "./procedures/check-name-availability.js";
import { registerVaultProcedure } from "./procedures/register-vault.js";
import { loginProcedure } from "./procedures/login.js";
import { logoutProcedure } from "./procedures/logout.js";
import { createSecretUpdateProcedure } from "./procedures/create-secret-update.js";
import { getSecretUpdatesProcedure } from "./procedures/get-secret-updates.js";
import { getVaultInfoProcedure } from "./procedures/get-vault-info.js";
import { getVaultInfoPublicProcedure } from "./procedures/get-vault-info-public.js";

/**
 * KeyPears Node API Router
 * TypeScript implementation of the KeyPears API
 */
export const router = {
  checkNameAvailability: checkNameAvailabilityProcedure,
  registerVault: registerVaultProcedure,
  login: loginProcedure,
  logout: logoutProcedure,
  createSecretUpdate: createSecretUpdateProcedure,
  getSecretUpdates: getSecretUpdatesProcedure,
  getVaultInfo: getVaultInfoProcedure,
  getVaultInfoPublic: getVaultInfoPublicProcedure,
};

// Export the router type for client usage
export type Router = typeof router;

// Re-export schemas for convenience
export * from "./zod-schemas.js";

// Re-export validation utilities for server use
export { validateKeypearsServer } from "./validation.js";
export type { ServerValidationResult } from "./validation.js";

// Re-export derivation key management
export {
  initDerivationKeys,
  getCurrentDerivationKey,
  getCurrentDerivationKeyIndex,
  getDerivationKey,
  getDerivationKeyCount,
  isDerivationKeysInitialized,
} from "./derivation-keys.js";
