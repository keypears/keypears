import { z } from "zod";
import { base } from "./base.js";
import { sha256Hash } from "@webbuf/sha256";
import { WebBuf } from "@webbuf/webbuf";
import { deleteDeviceSessionByHashedToken } from "../db/models/device-session.js";

// Input schema
const LogoutRequestSchema = z.object({
  sessionToken: z.string(),
});

// Output schema
const LogoutResponseSchema = z.object({
  success: z.boolean(),
});

/**
 * Logout endpoint - invalidates a session.
 *
 * Flow:
 * 1. Receive raw session token from client
 * 2. Hash session token with SHA-256
 * 3. Delete matching device session from database
 * 4. Return success (no error if session not found)
 *
 * Security:
 * - Client sends raw session token (what they received from login)
 * - Server hashes it to find matching database record
 * - Deleting the session immediately invalidates the token
 * - No error if session doesn't exist (idempotent)
 *
 * Note:
 * - Lock vault = logout (client should call this endpoint)
 * - Device remains "known" even after logout
 * - Re-login will update the session for the same device
 */
export const logoutProcedure = base
  .input(LogoutRequestSchema)
  .output(LogoutResponseSchema)
  .handler(async ({ input }) => {
    const { sessionToken } = input;

    // Hash incoming session token to find database record
    const sessionTokenBuf = WebBuf.fromHex(sessionToken);
    const hashedSessionToken = sha256Hash(sessionTokenBuf).buf.toHex();

    // Delete session (don't error if not found - idempotent)
    await deleteDeviceSessionByHashedToken(hashedSessionToken);

    return { success: true };
  });
