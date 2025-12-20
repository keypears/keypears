import { z } from "zod";
import { vaultNameSchema } from "@keypears/lib";

// Check name availability
export const CheckNameAvailabilityRequestSchema = z.object({
  name: vaultNameSchema,
  domain: z.string().min(1).max(255),
});

export const CheckNameAvailabilityResponseSchema = z.object({
  available: z.boolean(),
  // Difficulty requirement for registration (only present when available is true)
  difficulty: z.string().optional(),
});

// Register vault
export const RegisterVaultRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char Crockford Base32) generated client-side
  name: vaultNameSchema,
  domain: z.string().min(1).max(255),
  vaultPubKeyHash: z.string().length(64), // Blake3 hash hex = 64 chars
  vaultPubKey: z.string().length(66), // Compressed secp256k1 public key hex = 66 chars (33 bytes)
  loginKey: z.string().length(64), // Unhashed login key (hex)
  encryptedVaultKey: z.string(), // Encrypted vault key (hex, variable length due to ACB3)
  // PoW proof fields (required for registration)
  challengeId: z.string().length(26), // UUIDv7 of the PoW challenge
  solvedHeader: z.string(), // Solved header with nonce (length depends on algorithm)
  hash: z.string().length(64), // 32 bytes hex = 64 chars
});

export const RegisterVaultResponseSchema = z.object({
  vaultId: z.string(),
});

// Create secret update
export const CreateSecretUpdateRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
  secretId: z.string().length(26), // UUIDv7 (26-char, same for all updates to this secret)
  encryptedBlob: z.string().min(1), // Encrypted JSON containing all secret data
});

export const CreateSecretUpdateResponseSchema = z.object({
  id: z.string().length(26), // UUIDv7 (26-char) of the new update
  globalOrder: z.number().int().positive(),
  localOrder: z.number().int().positive(),
  createdAt: z.date(),
});

// Get secret updates (for polling)
export const GetSecretUpdatesRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
  sinceGlobalOrder: z.number().int().nonnegative().default(0), // Get updates after this order
  limit: z.number().int().positive().max(1000).default(100), // Batch size
});

export const GetSecretUpdatesResponseSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().length(26),
      secretId: z.string().length(26),
      globalOrder: z.number().int().positive(),
      localOrder: z.number().int().positive(),
      encryptedBlob: z.string(),
      createdAt: z.date(),
    }),
  ),
  hasMore: z.boolean(), // True if more updates exist beyond the limit
  latestGlobalOrder: z.number().int().nonnegative(), // Highest order in the vault
});

// Engagement key purpose enum
// - "manual": User-created via Engagement Keys page (general purpose)
// - "send": Auto-created when initiating messaging to someone
// - "receive": Auto-created when someone requests a key to message you
export const EngagementKeyPurposeSchema = z.enum(["send", "receive", "manual"]);
export type EngagementKeyPurpose = z.infer<typeof EngagementKeyPurposeSchema>;

// Create engagement key
export const CreateEngagementKeyRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
  purpose: EngagementKeyPurposeSchema, // Required - type of engagement key
  counterpartyAddress: z.string().max(255).optional(), // For send/receive keys
  counterpartyPubKey: z.string().length(66).optional(), // For receive keys (sender's pubkey)
});

export const CreateEngagementKeyResponseSchema = z.object({
  id: z.string().length(26), // UUIDv7 (26-char) of the engagement key record
  engagementPubKey: z.string().length(66), // 33 bytes hex = 66 chars
  createdAt: z.date(),
});

// Get engagement keys (paginated)
export const GetEngagementKeysRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
  limit: z.number().int().positive().max(100).default(20),
  beforeCreatedAt: z.date().optional(), // Cursor for pagination
});

export const GetEngagementKeysResponseSchema = z.object({
  keys: z.array(
    z.object({
      id: z.string().length(26),
      engagementPubKey: z.string().length(66),
      createdAt: z.date(),
      purpose: EngagementKeyPurposeSchema, // Type of engagement key
      counterpartyAddress: z.string().nullable(), // For send/receive keys
    }),
  ),
  hasMore: z.boolean(),
});

// Get derivation private key (for client to derive full private key)
export const GetDerivationPrivKeyRequestSchema = z.object({
  engagementKeyId: z.string().length(26), // UUIDv7 (26-char) of the engagement key record
});

export const GetDerivationPrivKeyResponseSchema = z.object({
  derivationPrivKey: z.string().length(64), // 32 bytes hex = 64 chars
});

// PoW Algorithm enum (currently only pow5-64b, more may be added in the future)
export const PowAlgorithmSchema = z.enum(["pow5-64b"]);
export type PowAlgorithm = z.infer<typeof PowAlgorithmSchema>;

// PoW Challenge - generates a challenge and stores it in the database
// Each challenge can only be used once and expires after 5 minutes
// Minimum difficulty: 1 (allows test mode with TEST_BASE_DIFFICULTY=1)
// Default difficulty: 4,194,304 (2^22)
// Note: Actual difficulty enforcement happens in registerVault via difficultyForName
export const GetPowChallengeRequestSchema = z.object({
  difficulty: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (val === undefined) return true;
        const num = BigInt(val);
        return num >= 1n;
      },
      { message: "Difficulty must be at least 1" },
    ),
});

export const GetPowChallengeResponseSchema = z.object({
  id: z.string().length(26), // UUIDv7 (26-char) challenge ID for verification
  header: z.string(), // 64 bytes (128 hex chars) for pow5-64b
  target: z.string().length(64), // 32 bytes hex = 64 chars
  difficulty: z.string(), // bigint as string
  algorithm: PowAlgorithmSchema,
});

// PoW Proof verification - looks up challenge from database and marks as used
export const VerifyPowProofRequestSchema = z.object({
  challengeId: z.string().length(26), // UUIDv7 (26-char) of the challenge to verify
  solvedHeader: z.string(), // Length depends on algorithm (with nonce filled in)
  hash: z.string().length(64), // 32 bytes hex
});

export const VerifyPowProofResponseSchema = z.object({
  valid: z.boolean(),
  message: z.string(),
});

// Vault Settings schema - stores user-configurable vault settings
// Used for messaging difficulty, future preferences, etc.
export const VaultSettingsSchema = z.object({
  // Messaging settings
  // Minimum PoW difficulty for channel opening (default: ~4M same as registration)
  messagingMinDifficulty: z.string().optional(),
});

export type VaultSettings = z.infer<typeof VaultSettingsSchema>;

// Get vault settings
export const GetVaultSettingsRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
});

export const GetVaultSettingsResponseSchema = z.object({
  settings: VaultSettingsSchema,
});

// Update vault settings
export const UpdateVaultSettingsRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
  settings: VaultSettingsSchema,
});

export const UpdateVaultSettingsResponseSchema = z.object({
  settings: VaultSettingsSchema,
});

// Channel status enum
// - "pending": User hasn't decided yet (or moved back to pending)
// - "saved": Channel is saved to user's vault (accepted)
// - "ignored": Hidden from main feed, only visible in "ignored" feed
export const ChannelStatusSchema = z.enum(["pending", "saved", "ignored"]);
export type ChannelStatus = z.infer<typeof ChannelStatusSchema>;

// Get engagement key for sending - creates or returns existing key for outgoing messages
export const GetEngagementKeyForSendingRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
  counterpartyAddress: z.string().min(1).max(255), // Who I want to message (name@domain)
});

export const GetEngagementKeyForSendingResponseSchema = z.object({
  engagementKeyId: z.string().length(26), // UUIDv7 (26-char)
  engagementPubKey: z.string().length(66), // 33 bytes hex = 66 chars
});

// Get counterparty engagement key - public endpoint for key exchange
// Sender provides their pubkey, recipient's server creates a key and returns it
export const GetCounterpartyEngagementKeyRequestSchema = z.object({
  recipientAddress: z.string().min(1).max(255), // Who I want to message (name@domain)
  senderAddress: z.string().min(1).max(255), // Who I am (name@domain)
  senderPubKey: z.string().length(66), // My engagement pubkey (33 bytes hex)
});

export const GetCounterpartyEngagementKeyResponseSchema = z.object({
  engagementPubKey: z.string().length(66), // Recipient's engagement pubkey
});

// Send message - public endpoint authenticated via PoW
export const SendMessageRequestSchema = z.object({
  recipientAddress: z.string().min(1).max(255), // Who I'm messaging (name@domain)
  senderAddress: z.string().min(1).max(255), // Who I am (name@domain)
  encryptedContent: z.string().min(1), // Encrypted message content
  senderEngagementPubKey: z.string().length(66), // My engagement pubkey
  recipientEngagementPubKey: z.string().length(66), // Their engagement pubkey
  powChallengeId: z.string().length(26), // UUIDv7 of the PoW challenge
  solvedHeader: z.string(), // Hex-encoded solved PoW header
  solvedHash: z.string().length(64), // 32 bytes hex = 64 chars
});

export const SendMessageResponseSchema = z.object({
  messageId: z.string().length(26), // UUIDv7 (26-char)
  orderInChannel: z.number().int().positive(),
  createdAt: z.date(),
});

// Get channels - list channels for an address with pagination
export const GetChannelsRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
  ownerAddress: z.string().min(1).max(255), // My address (name@domain)
  limit: z.number().int().positive().max(100).default(20),
  beforeUpdatedAt: z.date().optional(), // Cursor for pagination
});

export const GetChannelsResponseSchema = z.object({
  channels: z.array(
    z.object({
      id: z.string().length(26), // UUIDv7 (26-char)
      counterpartyAddress: z.string(),
      status: ChannelStatusSchema,
      minDifficulty: z.string().nullable(),
      unreadCount: z.number().int(),
      lastMessageAt: z.date().nullable(),
      createdAt: z.date(),
      updatedAt: z.date(),
    }),
  ),
  hasMore: z.boolean(),
});

// Get channel messages - returns messages in reverse chronological order
// Pagination: beforeOrder fetches older messages (going back in time)
export const GetChannelMessagesRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
  channelId: z.string().length(26), // UUIDv7 (26-char)
  limit: z.number().int().positive().max(100).default(50),
  beforeOrder: z.number().int().optional(), // Fetch messages older than this order
});

export const GetChannelMessagesResponseSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string().length(26), // UUIDv7 (26-char)
      senderAddress: z.string(),
      orderInChannel: z.number().int(),
      encryptedContent: z.string(),
      senderEngagementPubKey: z.string().length(66),
      recipientEngagementPubKey: z.string().length(66),
      isRead: z.boolean(),
      createdAt: z.date(),
    }),
  ),
  hasMore: z.boolean(), // True if there are older messages to fetch
});

// Update channel status - change status of a channel (pending/saved/ignored)
export const UpdateChannelStatusRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
  channelId: z.string().length(26), // UUIDv7 (26-char)
  status: ChannelStatusSchema,
});

export const UpdateChannelStatusResponseSchema = z.object({
  id: z.string().length(26), // UUIDv7 (26-char)
  status: ChannelStatusSchema,
  updatedAt: z.date(),
});

// Get engagement key by public key - look up engagement key ID from public key
// Used by client to find the engagement key ID for decryption
export const GetEngagementKeyByPubKeyRequestSchema = z.object({
  vaultId: z.string().length(26), // UUIDv7 (26-char)
  pubKey: z.string().length(66), // Compressed secp256k1 public key (33 bytes hex)
});

export const GetEngagementKeyByPubKeyResponseSchema = z.object({
  engagementKeyId: z.string().length(26), // UUIDv7 (26-char)
  purpose: EngagementKeyPurposeSchema,
  counterpartyAddress: z.string().nullable(),
});
