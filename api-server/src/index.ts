// Side-effect import: loads derivation keys from environment variables at module load time
import "./derivation-keys.js";

import { checkNameAvailabilityProcedure } from "./procedures/check-name-availability.js";
import { registerVaultProcedure } from "./procedures/register-vault.js";
import { loginProcedure } from "./procedures/login.js";
import { logoutProcedure } from "./procedures/logout.js";
import { createSecretUpdateProcedure } from "./procedures/create-secret-update.js";
import { getSecretUpdatesProcedure } from "./procedures/get-secret-updates.js";
import { getVaultInfoProcedure } from "./procedures/get-vault-info.js";
import { getVaultInfoPublicProcedure } from "./procedures/get-vault-info-public.js";
import { createEngagementKeyProcedure } from "./procedures/create-engagement-key.js";
import { getEngagementKeysProcedure } from "./procedures/get-engagement-keys.js";
import { getDerivationPrivKeyProcedure } from "./procedures/get-derivation-privkey.js";
import { getPowChallengeProcedure } from "./procedures/get-pow-challenge.js";
import { verifyPowProofProcedure } from "./procedures/verify-pow-proof.js";
import { getVaultSettingsProcedure } from "./procedures/get-vault-settings.js";
import { updateVaultSettingsProcedure } from "./procedures/update-vault-settings.js";
// Messaging procedures
import { getEngagementKeyForSendingProcedure } from "./procedures/get-engagement-key-for-sending.js";
import { getCounterpartyEngagementKeyProcedure } from "./procedures/get-counterparty-engagement-key.js";
import { sendMessageProcedure } from "./procedures/send-message.js";
import { getChannelsProcedure } from "./procedures/get-channels.js";
import { getChannelMessagesProcedure } from "./procedures/get-channel-messages.js";
import { updateChannelStatusProcedure } from "./procedures/update-channel-status.js";
import { getEngagementKeyByPubKeyProcedure } from "./procedures/get-engagement-key-by-pubkey.js";

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
  createEngagementKey: createEngagementKeyProcedure,
  getEngagementKeys: getEngagementKeysProcedure,
  getDerivationPrivKey: getDerivationPrivKeyProcedure,
  // PoW testing procedures (NOT SECURE - for testing only)
  getPowChallenge: getPowChallengeProcedure,
  verifyPowProof: verifyPowProofProcedure,
  // Vault settings
  getVaultSettings: getVaultSettingsProcedure,
  updateVaultSettings: updateVaultSettingsProcedure,
  // Messaging
  getEngagementKeyForSending: getEngagementKeyForSendingProcedure,
  getCounterpartyEngagementKey: getCounterpartyEngagementKeyProcedure,
  sendMessage: sendMessageProcedure,
  getChannels: getChannelsProcedure,
  getChannelMessages: getChannelMessagesProcedure,
  updateChannelStatus: updateChannelStatusProcedure,
  getEngagementKeyByPubKey: getEngagementKeyByPubKeyProcedure,
};

// Export the router type for client usage
export type Router = typeof router;

// Re-export schemas for convenience
export * from "./zod-schemas.js";

// Re-export validation utilities for server use
export { validateKeypearsServer } from "./validation.js";
export type { ServerValidationResult } from "./validation.js";

// Re-export derivation key management (keys are loaded automatically on import)
export {
  getCurrentDerivationKey,
  getCurrentDerivationKeyIndex,
  getDerivationKey,
  getDerivationKeyCount,
} from "./derivation-keys.js";
