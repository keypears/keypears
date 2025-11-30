import { z } from "zod";
import { base, validateVaultAuth } from "./base.js";
import { blake3Hash } from "@webbuf/blake3";
import { FixedBuf } from "@webbuf/fixedbuf";
import { createOrUpdateDeviceSession } from "../db/models/device-session.js";

// Input schema
const LoginRequestSchema = z.object({
  vaultId: z.string(),
  loginKey: z.string(),
  deviceId: z.string(),
  clientDeviceDescription: z.string().optional(),
});

// Output schema
const LoginResponseSchema = z.object({
  sessionToken: z.string(),
  expiresAt: z.number(),
  isNewDevice: z.boolean(),
});

/**
 * Login endpoint - creates a session for a device.
 *
 * Flow:
 * 1. Validate login key (proves user knows password)
 * 2. Generate random 32-byte session token
 * 3. Hash session token with Blake3 for storage
 * 4. Create or update device session in database
 * 5. Return raw session token (not hash) to client
 *
 * Security:
 * - Login key sent once per login (not every request)
 * - Session token is time-limited (24 hours)
 * - Server stores only Blake3 hash of session token
 * - Database breach does not expose usable tokens
 */
export const loginProcedure = base
  .input(LoginRequestSchema)
  .output(LoginResponseSchema)
  .handler(async ({ input }) => {
    const { vaultId, loginKey, deviceId, clientDeviceDescription } = input;

    // Validate login key (proves user knows password + vaultId)
    await validateVaultAuth(loginKey, vaultId);

    // Generate random 32-byte session token
    const sessionTokenFixedBuf = FixedBuf.fromRandom(32);
    const sessionToken = sessionTokenFixedBuf.buf.toHex(); // 64-char hex

    // Hash session token for storage (Blake3)
    const hashedSessionToken = blake3Hash(sessionTokenFixedBuf.buf).buf.toHex();

    // Set expiration (24 hours from now)
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    // Create or update device session
    const result = await createOrUpdateDeviceSession(
      vaultId,
      deviceId,
      hashedSessionToken,
      expiresAt,
      clientDeviceDescription,
    );

    // Return raw session token to client (NOT the hash)
    return {
      sessionToken, // Client will use this for authenticated requests
      expiresAt,
      isNewDevice: result.isNewDevice,
    };
  });
