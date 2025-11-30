import { z } from "zod";
import { sessionAuthedProcedure } from "./base.js";
import { getVaultByNameAndDomain } from "../db/models/vault.js";

// Input schema - requires name and domain to identify the vault
const GetVaultInfoRequestSchema = z.object({
  name: z.string(),
  domain: z.string(),
});

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
 * Requires authentication via X-Vault-Session-Token header.
 * Returns vault metadata needed to import vault into another client.
 */
export const getVaultInfoProcedure = sessionAuthedProcedure
  .input(GetVaultInfoRequestSchema)
  .output(GetVaultInfoResponseSchema)
  .handler(async ({ context, input }) => {
    const { vaultId } = context; // vaultId comes from session
    const { name, domain } = input;

    // Query vault by name and domain using model
    const vault = await getVaultByNameAndDomain(name, domain);

    if (!vault) {
      throw new Error(`Vault not found: ${name}@${domain}`);
    }

    // Verify session's vaultId matches requested vault
    if (vault.id !== vaultId) {
      throw new Error("Session vault does not match requested vault");
    }

    return {
      vaultId: vault.id,
      name: vault.name,
      domain: vault.domain,
      encryptedVaultKey: vault.encryptedVaultKey,
      vaultPubKeyHash: vault.vaultPubKeyHash,
    };
  });
