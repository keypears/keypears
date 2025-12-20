import { ORPCError } from "@orpc/server";
import { FixedBuf } from "@webbuf/fixedbuf";
import { sha256Hash } from "@webbuf/sha256";
import {
  deriveDerivationPrivKey,
  generateId,
  publicKeyCreate,
  publicKeyAdd,
} from "@keypears/lib";
import {
  GetCounterpartyEngagementKeyRequestSchema,
  GetCounterpartyEngagementKeyResponseSchema,
} from "../zod-schemas.js";
import { base } from "./base.js";
import { getVaultByNameAndDomain, getVaultSettings } from "../db/models/vault.js";
import { getEngagementKeyForReceiving } from "../db/models/engagement-key.js";
import { getChannelView } from "../db/models/channel.js";
import { db } from "../db/index.js";
import { TableEngagementKey } from "../db/schema.js";
import {
  getCurrentDerivationKey,
  getCurrentDerivationKeyIndex,
} from "../derivation-keys.js";
import { DEFAULT_MESSAGING_DIFFICULTY } from "../constants.js";

/**
 * Parse an address in the format "name@domain"
 * @param address - The address to parse
 * @returns Object with name and domain, or null if invalid format
 */
function parseAddress(address: string): { name: string; domain: string } | null {
  const atIndex = address.indexOf("@");
  if (atIndex === -1 || atIndex === 0 || atIndex === address.length - 1) {
    return null;
  }
  const name = address.slice(0, atIndex);
  const domain = address.slice(atIndex + 1);
  return { name, domain };
}

/**
 * Get counterparty engagement key - public key exchange endpoint
 * This is a public endpoint (no session required) that allows senders to
 * request a recipient's engagement key for DH key exchange.
 *
 * The sender provides their public key, and the recipient's server creates
 * a "receive" engagement key that stores the sender's pubkey for validation.
 *
 * DoS Prevention: This endpoint is idempotent - if the same sender sends
 * the same public key, the same engagement key is returned. This prevents
 * attackers from exhausting storage by repeatedly calling this endpoint.
 */
export const getCounterpartyEngagementKeyProcedure = base
  .input(GetCounterpartyEngagementKeyRequestSchema)
  .output(GetCounterpartyEngagementKeyResponseSchema)
  .handler(async ({ input }) => {
    const { recipientAddress, senderAddress, senderPubKey } = input;

    // Parse recipient address to get vault name and domain
    const parsed = parseAddress(recipientAddress);
    if (!parsed) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid recipient address format: ${recipientAddress}. Expected format: name@domain`,
      });
    }

    // Look up recipient's vault
    const vault = await getVaultByNameAndDomain(parsed.name, parsed.domain);
    if (!vault) {
      throw new ORPCError("NOT_FOUND", {
        message: `Vault not found for address: ${recipientAddress}`,
      });
    }

    if (!vault.vaultPubKey) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Recipient vault does not have a public key.",
      });
    }

    // Check if engagement key already exists for this sender + pubkey (idempotent)
    const existingKey = await getEngagementKeyForReceiving(
      vault.id,
      senderAddress,
      senderPubKey,
    );

    // Helper to resolve difficulty hierarchy: channel → vault → system default
    const resolveRequiredDifficulty = async (): Promise<number> => {
      // 1. Check channel-specific difficulty (recipient's view of sender)
      const channel = await getChannelView(recipientAddress, senderAddress);
      if (channel?.minDifficulty) {
        return channel.minDifficulty;
      }

      // 2. Check vault-level difficulty setting
      const vaultSettings = await getVaultSettings(vault.id);
      if (vaultSettings?.messagingMinDifficulty) {
        return vaultSettings.messagingMinDifficulty;
      }

      // 3. Use system default
      return DEFAULT_MESSAGING_DIFFICULTY;
    };

    if (existingKey) {
      // Return existing key (DoS prevention - same request = same response)
      const requiredDifficulty = await resolveRequiredDifficulty();
      return {
        engagementPubKey: existingKey.engagementPubKey,
        requiredDifficulty,
      };
    }

    // Create a new engagement key with purpose "receive"

    // 1. Generate random DB entropy
    const dbEntropy = FixedBuf.fromRandom(32);
    const dbEntropyHash = sha256Hash(dbEntropy.buf);

    // 2. Get current server entropy
    const serverEntropy = getCurrentDerivationKey();
    const serverEntropyIndex = getCurrentDerivationKeyIndex();

    // 3. Compute derivation private key
    const derivationPrivKey = deriveDerivationPrivKey(serverEntropy, dbEntropy);

    // 4. Compute derivation public key
    const derivationPubKey = publicKeyCreate(derivationPrivKey);

    // 5. Compute engagement public key (vault pubkey + derivation pubkey)
    const vaultPubKey = FixedBuf.fromHex(33, vault.vaultPubKey);
    const engagementPubKey = publicKeyAdd(vaultPubKey, derivationPubKey);
    const engagementPubKeyHash = sha256Hash(engagementPubKey.buf);

    // 6. Generate ID and insert record
    const id = generateId();

    await db.insert(TableEngagementKey).values({
      id,
      vaultId: vault.id,
      dbEntropy: dbEntropy.toHex(),
      dbEntropyHash: dbEntropyHash.toHex(),
      serverEntropyIndex,
      derivationPubKey: derivationPubKey.toHex(),
      engagementPubKey: engagementPubKey.toHex(),
      engagementPubKeyHash: engagementPubKeyHash.toHex(),
      purpose: "receive",
      counterpartyAddress: senderAddress,
      counterpartyPubKey: senderPubKey, // Store sender's pubkey for validation
    });

    const requiredDifficulty = await resolveRequiredDifficulty();
    return {
      engagementPubKey: engagementPubKey.toHex(),
      requiredDifficulty,
    };
  });
