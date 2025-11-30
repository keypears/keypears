import { z } from "zod";
import { vaultAuthedProcedure, validateVaultAuth } from "./base.js";
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
 * Requires authentication via X-Vault-Login-Key header.
 * Returns vault metadata needed to import vault into another client.
 */
export const getVaultInfoProcedure = vaultAuthedProcedure
  .input(GetVaultInfoRequestSchema)
  .output(GetVaultInfoResponseSchema)
  .handler(async ({ context, input }) => {
    const { loginKey } = context;
    const { name, domain } = input;

    // Query vault by name and domain using model
    const vault = await getVaultByNameAndDomain(name, domain);

    if (!vault) {
      throw new Error(`Vault not found: ${name}@${domain}`);
    }

    // Validate login key matches this specific vault
    await validateVaultAuth(loginKey, vault.id);

    return {
      vaultId: vault.id,
      name: vault.name,
      domain: vault.domain,
      encryptedVaultKey: vault.encryptedVaultKey,
      vaultPubKeyHash: vault.vaultPubKeyHash,
    };
  });
