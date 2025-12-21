import {
  GetPowChallengeRequestSchema,
  GetPowChallengeResponseSchema,
} from "@keypears/api-client";
import { base } from "./base.js";
import { createChallenge } from "../db/models/pow-challenge.js";
import { getVaultByNameAndDomain, getVaultSettings } from "../db/models/vault.js";
import { getChannelView } from "../db/models/channel.js";
import { DEFAULT_MESSAGING_DIFFICULTY } from "../constants.js";

// Default difficulty: 4,000,000 = ~4 million hashes average
// Takes a few seconds with WGSL, much longer with WASM
const DEFAULT_DIFFICULTY = 4_000_000n;

/**
 * Parse an address in the format "name@domain"
 * @param address - The address to parse
 * @returns Object with name and domain, or null if invalid format
 */
function parseAddress(
  address: string,
): { name: string; domain: string } | null {
  const atIndex = address.indexOf("@");
  if (atIndex === -1 || atIndex === 0 || atIndex === address.length - 1) {
    return null;
  }
  const name = address.slice(0, atIndex);
  const domain = address.slice(atIndex + 1);
  return { name, domain };
}

/**
 * Get PoW Challenge procedure
 *
 * Currently uses pow5-64b algorithm (more algorithms may be added in the future).
 * Returns a fully random 64-byte header and target for mining.
 * The challenge is stored in the database and can only be used once.
 *
 * When recipientAddress and senderAddress are provided (for messaging),
 * resolves difficulty from hierarchy:
 *   1. Channel-specific difficulty (highest priority)
 *   2. Recipient's vault messagingMinDifficulty setting
 *   3. System default (fallback)
 *
 * Note: This endpoint allows client-specified difficulty for testing purposes.
 * For registration, the server enforces a minimum difficulty during verification.
 *
 * pow5-64b: 64 bytes header, nonce region: bytes 0-31
 *
 * Security:
 * - Challenge stored in database with unique ID
 * - Challenge expires after 15 minutes
 * - Each challenge can only be verified once (marked as used)
 */
export const getPowChallengeProcedure = base
  .input(GetPowChallengeRequestSchema)
  .output(GetPowChallengeResponseSchema)
  .handler(async ({ input }) => {
    let difficulty: bigint;

    // If recipient/sender addresses provided, resolve difficulty from hierarchy
    if (input.recipientAddress && input.senderAddress) {
      difficulty = await resolveMessagingDifficulty(
        input.recipientAddress,
        input.senderAddress,
      );
    } else if (input.difficulty) {
      // Use client-provided difficulty (for testing or registration)
      difficulty = BigInt(input.difficulty);
    } else {
      // Default difficulty
      difficulty = DEFAULT_DIFFICULTY;
    }

    // Create challenge using model
    const challenge = await createChallenge({ difficulty });

    return {
      id: challenge.id,
      header: challenge.header,
      target: challenge.target,
      difficulty: challenge.difficulty,
      algorithm: challenge.algorithm,
    };
  });

/**
 * Resolve messaging difficulty from hierarchy:
 * 1. Channel-specific difficulty (recipient's view of sender)
 * 2. Recipient's vault messagingMinDifficulty setting
 * 3. System default
 *
 * @param recipientAddress - The recipient's address (name@domain)
 * @param senderAddress - The sender's address (name@domain)
 * @returns The resolved difficulty as a bigint
 */
async function resolveMessagingDifficulty(
  recipientAddress: string,
  senderAddress: string,
): Promise<bigint> {
  // Parse recipient address
  const parsed = parseAddress(recipientAddress);
  if (!parsed) {
    // Invalid format - use system default
    return BigInt(DEFAULT_MESSAGING_DIFFICULTY);
  }

  // Look up recipient's vault
  const vault = await getVaultByNameAndDomain(parsed.name, parsed.domain);
  if (!vault) {
    // Vault not found - use system default
    return BigInt(DEFAULT_MESSAGING_DIFFICULTY);
  }

  // 1. Check channel-specific difficulty (recipient's view of sender)
  const channel = await getChannelView(recipientAddress, senderAddress);
  if (channel?.minDifficulty) {
    return BigInt(channel.minDifficulty);
  }

  // 2. Check vault-level difficulty setting
  const vaultSettings = await getVaultSettings(vault.id);
  if (vaultSettings?.messagingMinDifficulty) {
    return BigInt(vaultSettings.messagingMinDifficulty);
  }

  // 3. Use system default
  return BigInt(DEFAULT_MESSAGING_DIFFICULTY);
}
