import { oc } from "@orpc/contract";
import {
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
  // Create engagement key
  CreateEngagementKeyRequestSchema,
  CreateEngagementKeyResponseSchema,
  // Get engagement keys
  GetEngagementKeysRequestSchema,
  GetEngagementKeysResponseSchema,
  // Get derivation private key
  GetDerivationPrivKeyRequestSchema,
  GetDerivationPrivKeyResponseSchema,
  // PoW challenge
  GetPowChallengeRequestSchema,
  GetPowChallengeResponseSchema,
  // Verify PoW proof
  VerifyPowProofRequestSchema,
  VerifyPowProofResponseSchema,
  // Vault settings
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

/**
 * KeyPears API Contract
 *
 * This contract defines all 26 API procedures with their input/output schemas.
 * It is used for:
 * 1. Client-side: Type-safe API client via ContractRouterClient<typeof contract>
 * 2. Server-side: Type-safe implementation via implement(contract)
 */
export const contract = {
  // ============================================================================
  // Public endpoints (no authentication required)
  // ============================================================================

  /** Check if a vault name is available for registration */
  checkNameAvailability: oc
    .input(CheckNameAvailabilityRequestSchema)
    .output(CheckNameAvailabilityResponseSchema),

  /** Register a new vault (requires PoW proof) */
  registerVault: oc
    .input(RegisterVaultRequestSchema)
    .output(RegisterVaultResponseSchema),

  /** Login to create a session */
  login: oc.input(LoginRequestSchema).output(LoginResponseSchema),

  /** Logout to invalidate a session */
  logout: oc.input(LogoutRequestSchema).output(LogoutResponseSchema),

  /** Get public vault information (for import) */
  getVaultInfoPublic: oc
    .input(GetVaultInfoPublicRequestSchema)
    .output(GetVaultInfoPublicResponseSchema),

  /** Get a PoW challenge */
  getPowChallenge: oc
    .input(GetPowChallengeRequestSchema)
    .output(GetPowChallengeResponseSchema),

  /** Verify a PoW proof */
  verifyPowProof: oc
    .input(VerifyPowProofRequestSchema)
    .output(VerifyPowProofResponseSchema),

  /** Get counterparty engagement key (for key exchange) */
  getCounterpartyEngagementKey: oc
    .input(GetCounterpartyEngagementKeyRequestSchema)
    .output(GetCounterpartyEngagementKeyResponseSchema),

  /** Send a message to another user */
  sendMessage: oc
    .input(SendMessageRequestSchema)
    .output(SendMessageResponseSchema),

  /** Verify engagement key ownership (cross-domain identity verification) */
  verifyEngagementKeyOwnership: oc
    .input(VerifyEngagementKeyOwnershipRequestSchema)
    .output(VerifyEngagementKeyOwnershipResponseSchema),

  // ============================================================================
  // Authenticated endpoints (require X-Vault-Session-Token header)
  // ============================================================================

  /** Get vault information (requires authentication) */
  getVaultInfo: oc
    .input(GetVaultInfoRequestSchema)
    .output(GetVaultInfoResponseSchema),

  /** Create a secret update */
  createSecretUpdate: oc
    .input(CreateSecretUpdateRequestSchema)
    .output(CreateSecretUpdateResponseSchema),

  /** Get secret updates (for sync) */
  getSecretUpdates: oc
    .input(GetSecretUpdatesRequestSchema)
    .output(GetSecretUpdatesResponseSchema),

  /** Create an engagement key */
  createEngagementKey: oc
    .input(CreateEngagementKeyRequestSchema)
    .output(CreateEngagementKeyResponseSchema),

  /** Get engagement keys (paginated) */
  getEngagementKeys: oc
    .input(GetEngagementKeysRequestSchema)
    .output(GetEngagementKeysResponseSchema),

  /** Get derivation private key (for deriving full private key) */
  getDerivationPrivKey: oc
    .input(GetDerivationPrivKeyRequestSchema)
    .output(GetDerivationPrivKeyResponseSchema),

  /** Get vault settings */
  getVaultSettings: oc
    .input(GetVaultSettingsRequestSchema)
    .output(GetVaultSettingsResponseSchema),

  /** Update vault settings */
  updateVaultSettings: oc
    .input(UpdateVaultSettingsRequestSchema)
    .output(UpdateVaultSettingsResponseSchema),

  /** Get engagement key for sending (creates fresh key for outgoing messages) */
  getEngagementKeyForSending: oc
    .input(GetEngagementKeyForSendingRequestSchema)
    .output(GetEngagementKeyForSendingResponseSchema),

  /** Get channels for an address */
  getChannels: oc
    .input(GetChannelsRequestSchema)
    .output(GetChannelsResponseSchema),

  /** Get messages in a channel */
  getChannelMessages: oc
    .input(GetChannelMessagesRequestSchema)
    .output(GetChannelMessagesResponseSchema),

  /** Get engagement key by public key (for decryption) */
  getEngagementKeyByPubKey: oc
    .input(GetEngagementKeyByPubKeyRequestSchema)
    .output(GetEngagementKeyByPubKeyResponseSchema),

  /** Get sender channel (for storing sent messages) */
  getSenderChannel: oc
    .input(GetSenderChannelRequestSchema)
    .output(GetSenderChannelResponseSchema),

  /** Get inbox messages for sync */
  getInboxMessagesForSync: oc
    .input(GetInboxMessagesForSyncRequestSchema)
    .output(GetInboxMessagesForSyncResponseSchema),

  /** Delete inbox messages (after syncing) */
  deleteInboxMessages: oc
    .input(DeleteInboxMessagesRequestSchema)
    .output(DeleteInboxMessagesResponseSchema),

  /** Update channel minimum difficulty */
  updateChannelMinDifficulty: oc
    .input(UpdateChannelMinDifficultyRequestSchema)
    .output(UpdateChannelMinDifficultyResponseSchema),
};

export type Contract = typeof contract;
