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
  CreateEngagementKeyRequestSchema,
  CreateEngagementKeyResponseSchema,
} from "../zod-schemas.js";
import { sessionAuthedProcedure } from "./base.js";
import { getVaultById } from "../db/models/vault.js";
import { db } from "../db/index.js";
import { TableEngagementKey } from "../db/schema.js";
import {
  getCurrentDerivationKey,
  getCurrentDerivationKeyIndex,
} from "../derivation-keys.js";

/**
 * Create engagement key procedure
 * Generates a new engagement public key for the vault using server-side key derivation
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * Key derivation flow:
 * 1. Generate random DB entropy (32 bytes)
 * 2. Get current server entropy from environment
 * 3. Compute derivationPrivKey = HMAC-SHA256(serverEntropy, dbEntropy)
 * 4. Compute derivationPubKey = derivationPrivKey * G
 * 5. Compute engagementPubKey = vaultPubKey + derivationPubKey
 * 6. Store record in database
 *
 * The server never learns the vault private key.
 * Only the vault owner can derive the full private key by adding their vault private key.
 */
export const createEngagementKeyProcedure = sessionAuthedProcedure
  .input(CreateEngagementKeyRequestSchema)
  .output(CreateEngagementKeyResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId } = input;

    const { purpose, counterpartyAddress, counterpartyPubKey } = input;

    // Verify session's vaultId matches input vaultId
    if (vaultId !== sessionVaultId) {
      throw new ORPCError("FORBIDDEN", {
        message: "Session vault does not match input vault",
      });
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
      purpose,
      counterpartyAddress,
      counterpartyPubKey,
    });

    // Fetch the created record to get createdAt timestamp
    const { eq } = await import("drizzle-orm");
    const [created] = await db
      .select()
      .from(TableEngagementKey)
      .where(eq(TableEngagementKey.id, id))
      .limit(1);

    if (!created) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to create engagement key",
      });
    }

    return {
      id: created.id,
      engagementPubKey: created.engagementPubKey,
      createdAt: created.createdAt,
    };
  });
