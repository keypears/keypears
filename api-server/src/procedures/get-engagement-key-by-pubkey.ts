import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { sha256Hash, WebBuf } from "@keypears/lib";
import {
  GetEngagementKeyByPubKeyRequestSchema,
  GetEngagementKeyByPubKeyResponseSchema,
} from "../zod-schemas.js";
import { sessionAuthedProcedure } from "./base.js";
import { db } from "../db/index.js";
import { TableEngagementKey } from "../db/schema.js";

/**
 * Get engagement key by public key procedure
 * Looks up an engagement key by its public key (via hash) and returns its ID
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * This is used by the client when decrypting messages:
 * 1. Client receives message with recipientEngagementPubKey
 * 2. Client calls this procedure to get the engagementKeyId
 * 3. Client calls getDerivationPrivKey with that ID to derive the private key
 * 4. Client uses private key for ECDH decryption
 *
 * Security: Only the vault owner can look up their own engagement keys
 */
export const getEngagementKeyByPubKeyProcedure = sessionAuthedProcedure
  .input(GetEngagementKeyByPubKeyRequestSchema)
  .output(GetEngagementKeyByPubKeyResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId, pubKey } = input;

    // Verify the request is for the authenticated vault
    if (vaultId !== sessionVaultId) {
      throw new ORPCError("FORBIDDEN", {
        message: "Cannot look up engagement keys for another vault",
      });
    }

    // Compute the hash of the public key to look up
    const pubKeyBuf = WebBuf.fromHex(pubKey);
    const pubKeyHash = sha256Hash(pubKeyBuf).toHex();

    // Look up the engagement key by hash (uses unique constraint as index)
    const [engagementKey] = await db
      .select()
      .from(TableEngagementKey)
      .where(eq(TableEngagementKey.engagementPubKeyHash, pubKeyHash))
      .limit(1);

    if (!engagementKey) {
      throw new ORPCError("NOT_FOUND", {
        message: "Engagement key not found for this public key",
      });
    }

    // Double-check the key belongs to the authenticated vault
    // (should always be true due to session auth, but defense in depth)
    if (engagementKey.vaultId !== sessionVaultId) {
      throw new ORPCError("FORBIDDEN", {
        message: "Engagement key does not belong to this vault",
      });
    }

    return {
      engagementKeyId: engagementKey.id,
      purpose: engagementKey.purpose as "send" | "receive" | "manual",
      counterpartyAddress: engagementKey.counterpartyAddress,
    };
  });
