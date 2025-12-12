import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { FixedBuf } from "@webbuf/fixedbuf";
import { deriveDerivationPrivKey } from "@keypears/lib";
import {
  GetDerivationPrivKeyRequestSchema,
  GetDerivationPrivKeyResponseSchema,
} from "../zod-schemas.js";
import { sessionAuthedProcedure } from "./base.js";
import { db } from "../db/index.js";
import { TableDerivedKey } from "../db/schema.js";
import { getDerivationKey } from "../derivation-keys.js";

/**
 * Get derivation private key procedure
 * Returns the derivation private key for a derived key record
 *
 * Authentication: Requires valid session token in X-Vault-Session-Token header
 *
 * The client uses this to derive the full private key:
 *   derivedPrivKey = vaultPrivKey + derivationPrivKey (mod curve order)
 *
 * Security: Only the vault owner can use this because:
 * 1. Requires valid session for the vault
 * 2. The derivation private key alone is useless without the vault private key
 * 3. The vault private key never leaves the client
 */
export const getDerivationPrivKeyProcedure = sessionAuthedProcedure
  .input(GetDerivationPrivKeyRequestSchema)
  .output(GetDerivationPrivKeyResponseSchema)
  .handler(async ({ input, context }) => {
    const { vaultId: sessionVaultId } = context;
    const { derivedKeyId } = input;

    // Look up the derived key record
    const [derivedKey] = await db
      .select()
      .from(TableDerivedKey)
      .where(eq(TableDerivedKey.id, derivedKeyId))
      .limit(1);

    if (!derivedKey) {
      throw new ORPCError("NOT_FOUND", {
        message: `Derived key not found: ${derivedKeyId}`,
      });
    }

    // Verify the derived key belongs to the authenticated vault
    if (derivedKey.vaultId !== sessionVaultId) {
      throw new ORPCError("FORBIDDEN", {
        message: "Derived key does not belong to this vault",
      });
    }

    // Get the server entropy for the index used when this key was created
    const serverEntropy = getDerivationKey(derivedKey.serverEntropyIndex);

    // Reconstruct the DB entropy from the stored hex
    const dbEntropy = FixedBuf.fromHex(32, derivedKey.dbEntropy);

    // Recompute the derivation private key
    const derivationPrivKey = deriveDerivationPrivKey(serverEntropy, dbEntropy);

    return {
      derivationPrivKey: derivationPrivKey.toHex(),
    };
  });
