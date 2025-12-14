import { ORPCError } from "@orpc/server";
import { FixedBuf } from "@webbuf/fixedbuf";
import {
  deriveHashedLoginKey,
  difficultyForName,
  isOfficialDomain,
} from "@keypears/lib";
import {
  RegisterVaultRequestSchema,
  RegisterVaultResponseSchema,
} from "../zod-schemas.js";
import { checkNameAvailability, createVault } from "../db/models/vault.js";
import { verifyAndConsume } from "../db/models/pow-challenge.js";
import { base } from "./base.js";

/**
 * Register vault procedure
 * Registers a new vault with the server after verifying proof-of-work
 *
 * PoW Verification:
 * - Client must complete a proof-of-work challenge before registering
 * - Prevents spam/abuse by requiring computational work
 * - Challenge is single-use and expires after 5 minutes
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
    const {
      vaultId,
      name,
      domain,
      vaultPubKeyHash,
      vaultPubKey,
      loginKey,
      encryptedVaultKey,
      challengeId,
      solvedHeader,
      hash,
    } = input;

    // 1. Verify PoW proof first (prevents spam/abuse)
    // CRITICAL: Enforce minimum difficulty based on name length to prevent bypass attacks
    // Shorter names require exponentially more work (2x per character shorter than 10)
    const powResult = await verifyAndConsume(challengeId, solvedHeader, hash, {
      minDifficulty: difficultyForName(name),
    });
    if (!powResult.valid) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid proof of work: ${powResult.message}`,
      });
    }

    // 2. Validate domain is official
    if (!isOfficialDomain(domain)) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Invalid domain: ${domain}. Must be an official KeyPears domain.`,
      });
    }

    // 3. Check name availability
    const available = await checkNameAvailability(name, domain);

    if (!available) {
      throw new ORPCError("CONFLICT", {
        message: `Vault name "${name}" is already taken for domain "${domain}"`,
      });
    }

    // 4. KDF the login key on server with vault ID salting (100k rounds for maximum security)
    // Client already did 100k rounds, we do MAC with vault ID + 100k rounds more
    const loginKeyBuf = FixedBuf.fromHex(32, loginKey);
    const serverHashedLoginKey = deriveHashedLoginKey(loginKeyBuf, vaultId);

    // 5. Create vault using model (with client-provided vault ID)
    await createVault({
      id: vaultId,
      name,
      domain,
      vaultPubKeyHash,
      vaultPubKey,
      hashedLoginKey: serverHashedLoginKey.buf.toHex(),
      encryptedVaultKey,
    });

    // 6. Return vault ID (confirmation of client-provided ID)
    return {
      vaultId,
    };
  });
