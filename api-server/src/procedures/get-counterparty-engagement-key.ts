import { ORPCError } from "@orpc/server";
import { FixedBuf } from "@webbuf/fixedbuf";
import { sha256Hash } from "@webbuf/sha256";
import {
  deriveDerivationPrivKey,
  generateId,
  publicKeyCreate,
  publicKeyAdd,
  verify,
} from "@keypears/lib";
import {
  GetCounterpartyEngagementKeyRequestSchema,
  GetCounterpartyEngagementKeyResponseSchema,
} from "../zod-schemas.js";
import { base } from "./base.js";
import {
  getVaultByNameAndDomain,
  getVaultSettings,
} from "../db/models/vault.js";
import {
  getEngagementKeyForReceiving,
  createEngagementKey,
} from "../db/models/engagement-key.js";
import { getChannelView } from "../db/models/channel.js";
import {
  verifyAndConsume,
  setChannelBinding,
} from "../db/models/pow-challenge.js";
import {
  getCurrentDerivationKey,
  getCurrentDerivationKeyIndex,
} from "../derivation-keys.js";
import { DEFAULT_MESSAGING_DIFFICULTY } from "../constants.js";
import { createClientFromDomain } from "../client.js";

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
 * Get counterparty engagement key - public key exchange endpoint
 * This is a public endpoint (no session required) that allows senders to
 * request a recipient's engagement key for DH key exchange.
 *
 * Security: This endpoint requires three layers of verification:
 * 1. PoW proof - prevents DoS attacks on key generation
 * 2. Signature verification - proves sender owns the private key for senderPubKey
 * 3. Cross-domain identity verification - confirms senderPubKey belongs to senderAddress
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
    const {
      recipientAddress,
      senderAddress,
      senderPubKey,
      powChallengeId,
      solvedHeader,
      solvedHash,
      signature,
    } = input;

    // Parse recipient address to get vault name and domain
    const recipientParsed = parseAddress(recipientAddress);
    if (!recipientParsed) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid recipient address format: ${recipientAddress}. Expected format: name@domain`,
      });
    }

    // Parse sender address to get domain for cross-domain verification
    const senderParsed = parseAddress(senderAddress);
    if (!senderParsed) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid sender address format: ${senderAddress}. Expected format: name@domain`,
      });
    }

    // Look up recipient's vault
    const vault = await getVaultByNameAndDomain(
      recipientParsed.name,
      recipientParsed.domain,
    );
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

    // Check if engagement key already exists for this sender + pubkey (idempotent)
    const existingKey = await getEngagementKeyForReceiving(
      vault.id,
      senderAddress,
      senderPubKey,
    );

    if (existingKey) {
      // Return existing key (DoS prevention - same request = same response)
      // Note: PoW was already consumed when this key was first created
      const requiredDifficulty = await resolveRequiredDifficulty();
      return {
        engagementPubKey: existingKey.engagementPubKey,
        requiredDifficulty,
      };
    }

    // =========================================================================
    // NEW: Verify PoW, signature, and cross-domain identity BEFORE creating key
    // =========================================================================

    // 1. Verify PoW proof
    const minDifficulty = BigInt(await resolveRequiredDifficulty());
    const powResult = await verifyAndConsume(
      powChallengeId,
      solvedHeader,
      solvedHash,
      { minDifficulty },
    );

    if (!powResult.valid) {
      throw new ORPCError("BAD_REQUEST", {
        message: `PoW verification failed: ${powResult.message}`,
      });
    }

    // 2. Verify signature (signature of solvedHash using sender's engagement private key)
    try {
      const signatureBuf = FixedBuf.fromHex(64, signature);
      const messageHashBuf = FixedBuf.fromHex(32, solvedHash);
      const pubKeyBuf = FixedBuf.fromHex(33, senderPubKey);

      const isValidSignature = verify(signatureBuf, messageHashBuf, pubKeyBuf);
      if (!isValidSignature) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invalid signature: signature does not match senderPubKey",
        });
      }
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw new ORPCError("BAD_REQUEST", {
        message: `Signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // 3. Cross-domain identity verification
    // Call sender's server to verify "does senderPubKey belong to senderAddress?"
    try {
      const senderClient = await createClientFromDomain(senderParsed.domain, {
        timeout: 10000, // 10 second timeout for cross-domain calls
      });

      const verifyResult = await senderClient.api.verifyEngagementKeyOwnership({
        address: senderAddress,
        engagementPubKey: senderPubKey,
      });

      if (!verifyResult.valid) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Sender identity verification failed: ${senderPubKey} does not belong to ${senderAddress}`,
        });
      }
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw new ORPCError("BAD_REQUEST", {
        message: `Cross-domain identity verification failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // 4. Store channel binding info on the consumed PoW challenge
    // This allows sendMessage to verify the PoW was consumed for THIS channel
    await setChannelBinding(
      powChallengeId,
      senderAddress,
      recipientAddress,
      senderPubKey,
    );

    // =========================================================================
    // Create a new engagement key with purpose "receive"
    // =========================================================================

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

    // 6. Generate ID and create engagement key record
    const id = generateId();

    await createEngagementKey({
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
