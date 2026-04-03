// Contract and types
export { contract, type Contract } from "./contract.js";

// Client factory functions
export {
  createClient,
  createClientFromDomain,
  clearApiUrlCache,
  type ClientConfig,
  type ClientFromDomainOptions,
  type KeypearsClient,
} from "./client.js";

// Server validation utilities
export {
  validateKeypearsServer,
  fetchKeypearsJson,
  type KeypearsJsonResult,
  type ServerValidationResult,
  type FetchOptions,
} from "./validation.js";

// Constants
export { MAX_ENCRYPTED_DATA_BYTES, DIFFICULTY_PRESETS } from "./constants.js";

// Re-export domain utilities from lib for convenience
export { buildBaseUrl } from "@keypears/lib";

// All schemas
export {
  // Check name availability
  CheckNameAvailabilityRequestSchema,
  CheckNameAvailabilityResponseSchema,
  // Register vault
  RegisterVaultRequestSchema,
  RegisterVaultResponseSchema,
  // Login
  LoginRequestSchema,
  LoginResponseSchema,
  // Logout
  LogoutRequestSchema,
  LogoutResponseSchema,
  // Get vault info (authenticated)
  GetVaultInfoRequestSchema,
  GetVaultInfoResponseSchema,
  // Get vault info public
  GetVaultInfoPublicRequestSchema,
  GetVaultInfoPublicResponseSchema,
  // Create secret update
  CreateSecretUpdateRequestSchema,
  CreateSecretUpdateResponseSchema,
  // Get secret updates
  GetSecretUpdatesRequestSchema,
  GetSecretUpdatesResponseSchema,
  // Engagement key purpose
  EngagementKeyPurposeSchema,
  type EngagementKeyPurpose,
  // Create engagement key
  CreateEngagementKeyRequestSchema,
  CreateEngagementKeyResponseSchema,
  // Get engagement keys
  GetEngagementKeysRequestSchema,
  GetEngagementKeysResponseSchema,
  // Get derivation private key
  GetDerivationPrivKeyRequestSchema,
  GetDerivationPrivKeyResponseSchema,
  // PoW
  PowAlgorithmSchema,
  type PowAlgorithm,
  GetPowChallengeRequestSchema,
  GetPowChallengeResponseSchema,
  VerifyPowProofRequestSchema,
  VerifyPowProofResponseSchema,
  // Vault settings
  VaultSettingsSchema,
  type VaultSettings,
  GetVaultSettingsRequestSchema,
  GetVaultSettingsResponseSchema,
  UpdateVaultSettingsRequestSchema,
  UpdateVaultSettingsResponseSchema,
  // Get engagement key for sending
  GetEngagementKeyForSendingRequestSchema,
  GetEngagementKeyForSendingResponseSchema,
  // Get counterparty engagement key
  GetCounterpartyEngagementKeyRequestSchema,
  GetCounterpartyEngagementKeyResponseSchema,
  // Send message
  SendMessageRequestSchema,
  SendMessageResponseSchema,
  // Get channels
  GetChannelsRequestSchema,
  GetChannelsResponseSchema,
  // Get channel messages
  GetChannelMessagesRequestSchema,
  GetChannelMessagesResponseSchema,
  // Get engagement key by public key
  GetEngagementKeyByPubKeyRequestSchema,
  GetEngagementKeyByPubKeyResponseSchema,
  // Get sender channel
  GetSenderChannelRequestSchema,
  GetSenderChannelResponseSchema,
  // Get inbox messages for sync
  GetInboxMessagesForSyncRequestSchema,
  GetInboxMessagesForSyncResponseSchema,
  // Delete inbox messages
  DeleteInboxMessagesRequestSchema,
  DeleteInboxMessagesResponseSchema,
  // Update channel min difficulty
  UpdateChannelMinDifficultyRequestSchema,
  UpdateChannelMinDifficultyResponseSchema,
  // Verify engagement key ownership
  VerifyEngagementKeyOwnershipRequestSchema,
  VerifyEngagementKeyOwnershipResponseSchema,
} from "./schemas.js";
