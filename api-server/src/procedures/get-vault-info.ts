import { z } from "zod";
import { eq } from "drizzle-orm";
import { vaultAuthedProcedure, validateVaultAuth } from "./base.js";
import { db } from "../db/index.js";
import { TableVault } from "../db/schema.js";

// Input schema (empty - uses loginKey from header via auth middleware)
const GetVaultInfoRequestSchema = z.object({});

// Output schema
const GetVaultInfoResponseSchema = z.object({
  vaultId: z.string(),
  name: z.string(),
  domain: z.string(),
  encryptedVaultKey: z.string(),
  vaultPubKeyHash: z.string(),
});

/**
 * Get vault information for import.
 * Requires authentication via X-Vault-Login-Key header.
 * Returns vault metadata needed to import vault into another client.
 */
export const getVaultInfoProcedure = vaultAuthedProcedure
  .input(GetVaultInfoRequestSchema)
  .output(GetVaultInfoResponseSchema)
  .handler(async ({ context }) => {
    const { loginKey } = context;

    // Find vault by validating login key
    const vaults = await db.select().from(TableVault);

    // Find the vault that matches this login key
    let matchedVault = null;
    for (const vault of vaults) {
      try {
        await validateVaultAuth(loginKey, vault.id);
        matchedVault = vault;
        break;
      } catch (error) {
        // Not this vault, continue
        continue;
      }
    }

    if (!matchedVault) {
      throw new Error("Vault not found for provided login key");
    }

    return {
      vaultId: matchedVault.id,
      name: matchedVault.name,
      domain: matchedVault.domain,
      encryptedVaultKey: matchedVault.encryptedVaultKey,
      vaultPubKeyHash: matchedVault.vaultPubKeyHash,
    };
  });
