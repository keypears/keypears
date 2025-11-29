import { eq, and } from "drizzle-orm";
import { ORPCError, os } from "@orpc/server";
import { FixedBuf } from "@webbuf/fixedbuf";
import { deriveHashedLoginKey, isOfficialDomain } from "@keypears/lib";
import { ulid } from "ulid";
import {
  RegisterVaultRequestSchema,
  RegisterVaultResponseSchema,
} from "../zod-schemas.js";
import { db } from "../db/index.js";
import { TableVault } from "../db/schema.js";

/**
 * Register vault procedure
 * Registers a new vault with the server
 *
 * Security: Server KDFs the login key (1k rounds)
 * - Client sends: loginKey (unhashed, already underwent 100k rounds)
 * - Server derives: hashedLoginKey = blake3Pbkdf(loginKey, serverSalt, 1k)
 * - Server stores: hashedLoginKey + encryptedVaultKey
 * This prevents the server from storing raw login key while minimizing DOS risk
 */
export const registerVaultProcedure = os
  .input(RegisterVaultRequestSchema)
  .output(RegisterVaultResponseSchema)
  .handler(async ({ input }): Promise<{ vaultId: string }> => {
    const { name, domain, vaultPubKeyHash, loginKey, encryptedVaultKey } = input;

    // 1. Validate domain is official
    if (!isOfficialDomain(domain)) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid domain: ${domain}. Must be an official KeyPears domain.`,
      });
    }

    // 2. Check name availability
    const existing = await db
      .select()
      .from(TableVault)
      .where(and(eq(TableVault.name, name), eq(TableVault.domain, domain)))
      .limit(1);

    if (existing.length > 0) {
      throw new ORPCError("CONFLICT", {
        message: `Vault name "${name}" is already taken for domain "${domain}"`,
      });
    }

    // 3. KDF the login key on server (1k rounds for security + DOS prevention)
    // Client already did 100k rounds, we do 1k more to prevent raw login key storage
    const loginKeyBuf = FixedBuf.fromHex(32, loginKey);
    const serverHashedLoginKey = deriveHashedLoginKey(loginKeyBuf);

    // 4. Insert vault into database with encrypted vault key
    const vaultId = ulid();
    await db.insert(TableVault).values({
      id: vaultId,
      name,
      domain,
      vaultPubKeyHash,
      hashedLoginKey: serverHashedLoginKey.buf.toHex(),
      encryptedVaultKey, // Store for cross-device import
    });

    // 5. Return vault ID
    return {
      vaultId,
    };
  });
