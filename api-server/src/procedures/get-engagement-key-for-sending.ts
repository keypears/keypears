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
  GetEngagementKeyForSendingRequestSchema,
  GetEngagementKeyForSendingResponseSchema,
} from "../zod-schemas.js";
import { sessionAuthedProcedure } from "./base.js";
import { getVaultById } from "../db/models/vault.js";
import { getEngagementKeyForSending } from "../db/models/engagement-key.js";
import { db } from "../db/index.js";
import { TableEngagementKey } from "../db/schema.js";
import {
  getCurrentDerivationKey,
  getCurrentDerivationKeyIndex,
} from "../derivation-keys.js";

/**
 * Get engagement key for sending
 * Returns an existing engagement key for the counterparty, or creates a new one
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * This procedure is idempotent - calling it multiple times with the same
 * counterpartyAddress returns the same key (if it exists).
 */
export const getEngagementKeyForSendingProcedure = sessionAuthedProcedure
  .input(GetEngagementKeyForSendingRequestSchema)
  .output(GetEngagementKeyForSendingResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId, counterpartyAddress } = input;

    // Verify session's vaultId matches input vaultId
    if (vaultId !== sessionVaultId) {
      throw new ORPCError("FORBIDDEN", {
        message: "Session vault does not match input vault",
      });
    }

    // Check if engagement key already exists for this counterparty
    const existingKey = await getEngagementKeyForSending(
      vaultId,
      counterpartyAddress,
    );

    if (existingKey) {
      return {
        engagementKeyId: existingKey.id,
        engagementPubKey: existingKey.engagementPubKey,
      };
    }

    // Get vault to retrieve vaultPubKey
    const vault = await getVaultById(vaultId);
    if (!vault) {
      throw new ORPCError("NOT_FOUND", {
        message: `Vault not found: ${vaultId}`,
      });
    }

    if (!vault.vaultPubKey) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Vault does not have a public key. Please re-register the vault.",
      });
    }

    // Create a new engagement key with purpose "send"

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
      vaultId,
      dbEntropy: dbEntropy.toHex(),
      dbEntropyHash: dbEntropyHash.toHex(),
      serverEntropyIndex,
      derivationPubKey: derivationPubKey.toHex(),
      engagementPubKey: engagementPubKey.toHex(),
      engagementPubKeyHash: engagementPubKeyHash.toHex(),
      purpose: "send",
      counterpartyAddress,
      counterpartyPubKey: null, // Will be updated when we get their key
    });

    return {
      engagementKeyId: id,
      engagementPubKey: engagementPubKey.toHex(),
    };
  });
