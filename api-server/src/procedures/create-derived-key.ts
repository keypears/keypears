import { ORPCError } from "@orpc/server";
import { ulid } from "ulid";
import { FixedBuf } from "@webbuf/fixedbuf";
import { sha256Hash } from "@webbuf/sha256";
import {
  deriveDerivationPrivKey,
  publicKeyCreate,
  publicKeyAdd,
} from "@keypears/lib";
import {
  CreateDerivedKeyRequestSchema,
  CreateDerivedKeyResponseSchema,
} from "../zod-schemas.js";
import { sessionAuthedProcedure } from "./base.js";
import { getVaultById } from "../db/models/vault.js";
import { db } from "../db/index.js";
import { TableDerivedKey } from "../db/schema.js";
import {
  getCurrentDerivationKey,
  getCurrentDerivationKeyIndex,
} from "../derivation-keys.js";

/**
 * Create derived key procedure
 * Generates a new derived public key for the vault using server-side key derivation
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * Key derivation flow:
 * 1. Generate random DB entropy (32 bytes)
 * 2. Get current server entropy from environment
 * 3. Compute derivationPrivKey = HMAC-SHA256(serverEntropy, dbEntropy)
 * 4. Compute derivationPubKey = derivationPrivKey * G
 * 5. Compute derivedPubKey = vaultPubKey + derivationPubKey
 * 6. Store record in database
 *
 * The server never learns the vault private key.
 * Only the vault owner can derive the full private key by adding their vault private key.
 */
export const createDerivedKeyProcedure = sessionAuthedProcedure
  .input(CreateDerivedKeyRequestSchema)
  .output(CreateDerivedKeyResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { vaultId } = input;

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

    // 5. Compute derived public key (vault pubkey + derivation pubkey)
    const vaultPubKey = FixedBuf.fromHex(33, vault.vaultPubKey);
    const derivedPubKey = publicKeyAdd(vaultPubKey, derivationPubKey);
    const derivedPubKeyHash = sha256Hash(derivedPubKey.buf);

    // 6. Generate ID and insert record
    const id = ulid();

    await db.insert(TableDerivedKey).values({
      id,
      vaultId,
      dbEntropy: dbEntropy.toHex(),
      dbEntropyHash: dbEntropyHash.toHex(),
      serverEntropyIndex,
      derivationPubKey: derivationPubKey.toHex(),
      derivedPubKey: derivedPubKey.toHex(),
      derivedPubKeyHash: derivedPubKeyHash.toHex(),
    });

    // Fetch the created record to get createdAt timestamp
    const { eq } = await import("drizzle-orm");
    const [created] = await db
      .select()
      .from(TableDerivedKey)
      .where(eq(TableDerivedKey.id, id))
      .limit(1);

    if (!created) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to create derived key",
      });
    }

    return {
      id: created.id,
      derivedPubKey: created.derivedPubKey,
      createdAt: created.createdAt,
    };
  });
