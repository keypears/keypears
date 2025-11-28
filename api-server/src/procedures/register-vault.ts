import { eq, and } from "drizzle-orm";
import { ORPCError, os } from "@orpc/server";
import { blake3Hash } from "@webbuf/blake3";
import { WebBuf } from "@webbuf/webbuf";
import { ulid } from "ulid";
import { isOfficialDomain } from "@keypears/lib";
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
 * Security: Server hashes the login key again (double-hash)
 * - Client sends: hash(password key)
 * - Server stores: hash(hash(password key))
 * This prevents the server from using a compromised login key to authenticate
 */
export const registerVaultProcedure = os
  .input(RegisterVaultRequestSchema)
  .output(RegisterVaultResponseSchema)
  .handler(async ({ input }): Promise<{ vaultId: string }> => {
    const { name, domain, encryptedPasswordKey, hashedLoginKey } = input;

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

    // 3. Hash the login key on server (double-hash for security)
    const loginKeyBuf = WebBuf.fromHex(hashedLoginKey);
    const serverHashedLoginKey = blake3Hash(loginKeyBuf);

    // 4. Insert vault into database
    const vaultId = ulid();
    await db.insert(TableVault).values({
      id: vaultId,
      name,
      domain,
      encryptedPasswordKey,
      hashedLoginKey: serverHashedLoginKey.buf.toHex(),
    });

    // 5. Return vault ID
    return {
      vaultId,
    };
  });
