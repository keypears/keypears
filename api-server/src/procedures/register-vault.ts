import { ORPCError } from "@orpc/server";
import { FixedBuf } from "@webbuf/fixedbuf";
import { deriveHashedLoginKey, isOfficialDomain } from "@keypears/lib";
import {
  RegisterVaultRequestSchema,
  RegisterVaultResponseSchema,
} from "../zod-schemas.js";
import { checkNameAvailability, createVault } from "../db/models/vault.js";
import { base } from "./base.js";

/**
 * Register vault procedure
 * Registers a new vault with the server
 *
 * Security: Server KDFs the login key with vault ID salting (100k rounds)
 * - Client sends: vaultId (ULID), loginKey (unhashed, already underwent 100k rounds)
 * - Server derives: hashedLoginKey = sha256Hmac(vaultId, loginKey) then sha256Pbkdf(..., 100k)
 * - Server stores: hashedLoginKey + encryptedVaultKey
 *
 * Vault ID salting provides two security benefits:
 * 1. Prevents password reuse detection across vaults
 * 2. Same password + different vault ID → different hashed login key
 *
 * This prevents the server from storing raw login key with maximum security.
 */
export const registerVaultProcedure = base
  .input(RegisterVaultRequestSchema)
  .output(RegisterVaultResponseSchema)
  .handler(async ({ input }): Promise<{ vaultId: string }> => {
    const { vaultId, name, domain, vaultPubKeyHash, loginKey, encryptedVaultKey } = input;

    // 1. Validate domain is official
    if (!isOfficialDomain(domain)) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid domain: ${domain}. Must be an official KeyPears domain.`,
      });
    }

    // 2. Check name availability
    const available = await checkNameAvailability(name, domain);

    if (!available) {
      throw new ORPCError("CONFLICT", {
        message: `Vault name "${name}" is already taken for domain "${domain}"`,
      });
    }

    // 3. KDF the login key on server with vault ID salting (100k rounds for maximum security)
    // Client already did 100k rounds, we do MAC with vault ID + 100k rounds more
    const loginKeyBuf = FixedBuf.fromHex(32, loginKey);
    const serverHashedLoginKey = deriveHashedLoginKey(loginKeyBuf, vaultId);

    // 4. Create vault using model (with client-provided vault ID)
    await createVault({
      id: vaultId,
      name,
      domain,
      vaultPubKeyHash,
      hashedLoginKey: serverHashedLoginKey.buf.toHex(),
      encryptedVaultKey,
    });

    // 5. Return vault ID (confirmation of client-provided ID)
    return {
      vaultId,
    };
  });
