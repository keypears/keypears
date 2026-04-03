import { z } from "zod";
import { base } from "./base.js";
import { getVaultByNameAndDomain } from "../db/models/vault.js";

// Input schema - requires name and domain to identify the vault
const GetVaultInfoPublicRequestSchema = z.object({
  name: z.string(),
  domain: z.string(),
});

// Output schema - returns public vault metadata
const GetVaultInfoPublicResponseSchema = z.object({
  vaultId: z.string(),
  name: z.string(),
  domain: z.string(),
  encryptedVaultKey: z.string(),
  vaultPubKeyHash: z.string(),
});

/**
 * Get public vault information (no authentication required).
 *
 * This endpoint is used during the import flow to get the vaultId,
 * which is required for client-side key derivation. The vaultId must
 * be public because it's used as salt in derivePasswordKey().
 *
 * Returns vault metadata needed to import vault into another client.
 * No sensitive data is exposed - all secrets remain encrypted.
 */
export const getVaultInfoPublicProcedure = base
  .input(GetVaultInfoPublicRequestSchema)
  .output(GetVaultInfoPublicResponseSchema)
  .handler(async ({ input }) => {
    const { name, domain } = input;

    // Query vault by name and domain using model
    const vault = await getVaultByNameAndDomain(name, domain);

    if (!vault) {
      throw new Error(`Vault not found: ${name}@${domain}`);
    }

    return {
      vaultId: vault.id,
      name: vault.name,
      domain: vault.domain,
      encryptedVaultKey: vault.encryptedVaultKey,
      vaultPubKeyHash: vault.vaultPubKeyHash,
    };
  });
